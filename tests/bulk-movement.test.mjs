import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const sql = await Promise.all(['20260928000100_initial.sql', '20260930000100_service_role_grants.sql', '20261002000100_bulk_movement.sql']
  .map((name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')))
const seed = await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8')

test('bulk movement saves all rows and histories atomically', async (t) => {
  const pg = new PGlite()
  t.after(() => pg.close())
  await pg.exec(`create schema auth; create table auth.users (id uuid primary key);
    create role service_role bypassrls; create role anon; create role authenticated;`)
  await pg.exec(sql[0])
  // This test isolates public movement from Auth policies and photo migrations.
  await pg.exec('create table public.admin_users (user_id uuid primary key)')
  await pg.exec(sql[1]); await pg.exec(sql[2]); await pg.exec(seed)
  const actor = (await pg.query("select id from public.members where name = '佐藤'")).rows[0].id
  const destination = (await pg.query("select id from public.locations where name = '物理部室'")).rows[0].id
  const origin = (await pg.query("select id from public.locations where name = '北倉庫'")).rows[0].id
  // Deterministic IDs force the stale/deleted second row to fail after the first move.
  const first = '10000000-0000-4000-8000-000000000001'
  const second = '10000000-0000-4000-8000-000000000002'
  await pg.query(`insert into public.equipments (id,name,category_id,current_location_id,status)
    select $1,'一括テスト1',id,$2,'stored' from public.categories limit 1`, [first, origin])
  await pg.query(`insert into public.equipments (id,name,category_id,current_location_id,status)
    select $1,'一括テスト2',id,$2,'stored' from public.categories limit 1`, [second, origin])
  async function items() {
    return (await pg.query(`select id, updated_at::text as expected_updated_at from public.equipments
      where id in ($1,$2) order by id`, [first, second])).rows
  }
  async function snapshot() {
    return {
      equipment: (await pg.query('select * from public.equipments order by id')).rows,
      history: (await pg.query('select * from public.movement_history order by id')).rows,
    }
  }
  async function move(batch, toId = destination, toType = 'location', by = actor) {
    return (await pg.query('select public.move_equipments($1::jsonb,$2,$3,$4,$5) as result',
      [JSON.stringify(batch), toType, toId, by, ' 一括メモ '])).rows[0].result
  }
  await t.test('service role moves two rows and records per-equipment actor and note', async () => {
    const batch = await items()
    await pg.exec('set role service_role')
    try { assert.deepEqual(await move(batch.reverse()), { movedCount: 2, skippedCount: 0 }) }
    finally { await pg.exec('reset role') }
    const histories = (await pg.query('select * from public.movement_history where equipment_id in ($1,$2)', [first, second])).rows
    assert.equal(histories.length, 2)
    for (const row of histories) {
      assert.equal(row.from_id, origin); assert.equal(row.to_id, destination)
      assert.equal(row.changed_by_member_id, actor); assert.equal(row.note, '一括メモ')
    }
    const state = (await pg.query('select status,current_location_id from public.equipments where id in ($1,$2)', [first, second])).rows
    assert(state.every((row) => row.status === 'stored' && row.current_location_id === destination))
  })
  await t.test('existing destination is skipped without duplicate histories or timestamp changes', async () => {
    const before = await snapshot()
    assert.deepEqual(await move(await items()), { movedCount: 0, skippedCount: 2 })
    assert.deepEqual(await snapshot(), before)
  })
  await t.test('stale second row rolls back the first update and its history', async () => {
    const batch = await items()
    batch[1].expected_updated_at = '2000-01-01T00:00:00Z'
    const before = await snapshot()
    await assert.rejects(move(batch, actor, 'member'), /equipment_changed/)
    assert.deepEqual(await snapshot(), before)
  })
  await t.test('deleted second row also rolls back the first move', async () => {
    const batch = await items()
    await pg.query('update public.equipments set deleted_at = now() where id = $1', [second])
    const before = await snapshot()
    await assert.rejects(move(batch, actor, 'member'), /equipment_not_found/)
    assert.deepEqual(await snapshot(), before)
    await pg.query('update public.equipments set deleted_at = null where id = $1', [second])
  })
  await t.test('mixed changed and unchanged rows report accurate counts', async () => {
    let batch = await items()
    assert.deepEqual(await move([batch[0]], actor, 'member'), { movedCount: 1, skippedCount: 0 })
    batch = await items()
    assert.deepEqual(await move(batch, actor, 'member'), { movedCount: 1, skippedCount: 1 })
    const state = (await pg.query('select status,current_member_id from public.equipments where id in ($1,$2)', [first, second])).rows
    assert(state.every((row) => row.status === 'borrowed' && row.current_member_id === actor))
  })
  await t.test('invalid batches and inactive actors or destinations leave all data unchanged', async () => {
    const batch = await items()
    const before = await snapshot()
    for (const invalid of [[], [batch[0], batch[0]], Array(101).fill(batch[0]), null, [{}],
      [{ id: first, expected_updated_at: 'not-a-time' }], [{ id: 'not-a-uuid', expected_updated_at: '2026-10-02' }]]) {
      await assert.rejects(move(invalid), /invalid_batch/)
    }
    await pg.query('update public.members set active = false where id = $1', [actor])
    await assert.rejects(move(batch), /invalid_actor/)
    await pg.query('update public.members set active = true where id = $1', [actor])
    await pg.query('update public.locations set active = false where id = $1', [destination])
    await assert.rejects(move(batch), /invalid_destination/)
    await pg.query('update public.locations set active = true where id = $1', [destination])
    assert.deepEqual(await snapshot(), before)
  })
  await t.test('anon and authenticated cannot call the bulk RPC directly', async () => {
    const batch = await items()
    for (const role of ['anon', 'authenticated']) {
      await pg.exec(`set role ${role}`)
      try { await assert.rejects(move(batch), /permission denied/) }
      finally { await pg.exec('reset role') }
    }
  })
})
