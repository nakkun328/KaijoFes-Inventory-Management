import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = await readFile(new URL('../supabase/migrations/20260928000100_initial.sql', import.meta.url), 'utf8')
const seed = await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8')
const verification = await readFile(new URL('../supabase/verify_movement.sql', import.meta.url), 'utf8')

test('migration and movement acceptance checks run on PostgreSQL', async (t) => {
  const pg = new PGlite()
  t.after(async () => { await pg.close() })

  // Supabase provides these before project migrations run.
  await pg.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create role service_role;
    create role anon;
    create role authenticated;
  `)
  await pg.exec(migration)
  await pg.exec(seed)
  await pg.exec(verification)

  const state = await pg.query(`
    select e.status, l.name as location, count(h.id)::integer as history_count
    from public.equipments e
    join public.locations l on l.id = e.current_location_id
    left join public.movement_history h on h.equipment_id = e.id
    where e.name = 'DJI RS 3'
    group by e.status, l.name
  `)
  assert.deepEqual(state.rows, [{ status: 'stored', location: '北倉庫', history_count: 0 }])

  await t.test('history cannot be edited', async () => {
    const result = await pg.query(`
      select e.id, e.updated_at, m.id as actor_id, l.id as location_id
      from public.equipments e cross join public.members m cross join public.locations l
      where e.name = 'DJI RS 3' and m.name = '佐藤' and l.name = '物理部室'
    `)
    const { id, updated_at, actor_id, location_id } = result.rows[0]
    await pg.query('select public.move_equipment($1,$2,$3,$4,$5)', [id, 'location', location_id, actor_id, updated_at])
    await assert.rejects(pg.query('delete from public.movement_history'), /append-only/)
    await assert.rejects(pg.query('update public.movement_history set note = $1', ['edited']), /append-only/)
  })

  await t.test('RLS hides rows and anonymous role cannot invoke movement RPC', async () => {
    await pg.exec('set role anon')
    try {
      await assert.rejects(pg.query('select * from public.equipments'), /permission denied/)
    } finally {
      await pg.exec('reset role')
    }
    // Supabase grants table SELECT to anon; RLS must still hide the records.
    await pg.exec('grant usage on schema public to anon; grant select on all tables in schema public to anon;')
    await pg.exec('set role anon')
    try {
      const result = await pg.query('select * from public.equipments')
      assert.equal(result.rows.length, 0)
      await assert.rejects(pg.query(`select public.move_equipment(null,null,null,null,null)`), /permission denied/)
    } finally {
      await pg.exec('reset role')
    }
  })
})
