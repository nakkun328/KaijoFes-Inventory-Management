import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const initial = await readFile(new URL('../supabase/migrations/20260928000100_initial.sql', import.meta.url), 'utf8')
const admin = await readFile(new URL('../supabase/migrations/20260928000200_admin.sql', import.meta.url), 'utf8')
const constraints = await readFile(new URL('../supabase/migrations/20260928000300_admin_constraints.sql', import.meta.url), 'utf8')
const seed = await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8')
const adminId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const ordinaryId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'

test('admin migration enforces allowlist, RLS, and immutable movement ownership', async (t) => {
  const pg = new PGlite()
  t.after(async () => { await pg.close() })
  await pg.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create role service_role;
    create role anon;
    create role authenticated;
  `)
  await pg.exec(initial)
  await pg.exec(admin)
  await pg.exec(constraints)
  await pg.exec(seed)
  await pg.query('insert into auth.users (id) values ($1), ($2)', [adminId, ordinaryId])
  await pg.query('insert into public.admin_users (user_id) values ($1)', [adminId])
  await pg.exec('grant usage on schema auth, public to anon, authenticated; grant execute on function auth.uid() to authenticated;')
  const targetIds = (await pg.query(`
    select c.id as category_id, l.id as location_id
    from public.categories c cross join public.locations l
    where c.name = 'ジンバル' and l.name = '北倉庫'
  `)).rows[0]

  async function asRole(role, uid, fn) {
    await pg.exec(`set request.jwt.claim.sub = '${uid}'; set role ${role};`)
    try { await fn() } finally { await pg.exec('reset role; reset request.jwt.claim.sub;') }
  }

  await t.test('allowlisted administrator can read and maintain metadata', async () => {
    await asRole('authenticated', adminId, async () => {
      assert.equal((await pg.query('select user_id from public.admin_users')).rows[0].user_id, adminId)
      assert.equal((await pg.query('select count(*)::integer as n from public.equipments')).rows[0].n, 2)
      assert.equal((await pg.query('select count(*)::integer as n from public.movement_history')).rows[0].n, 0)

      await pg.query("insert into public.categories (name) values ('テストカテゴリ')")
      await pg.query("update public.categories set name = '更新カテゴリ' where name = 'テストカテゴリ'")
      assert.equal((await pg.query("select name from public.categories where name = '更新カテゴリ'")).rows.length, 1)

      const inserted = await pg.query(`
        insert into public.equipments (name, category_id, current_location_id, status)
        select '追加テスト備品', c.id, l.id, 'stored'
        from public.categories c cross join public.locations l
        where c.name = '更新カテゴリ' and l.name = '北倉庫'
        returning management_number
      `)
      assert.match(inserted.rows[0].management_number, /^EQ-\d{6}$/)

      const equipment = (await pg.query("select id from public.equipments where name = 'DJI RS 3'")).rows[0]
      await assert.rejects(pg.query('update public.equipments set deleted_at = now() where id = $1', [equipment.id]), /row-level security policy|equipment_deletion_metadata_complete/)
      await assert.rejects(pg.query('update public.equipments set deleted_at = now(), deleted_by = $1 where id = $2', [ordinaryId, equipment.id]), /row-level security policy/)
      await pg.query('update public.equipments set deleted_at = now(), deleted_by = $1 where id = $2', [adminId, equipment.id])
      assert.equal((await pg.query('select deleted_at is not null as deleted from public.equipments where id = $1', [equipment.id])).rows[0].deleted, true)
      await pg.query('update public.equipments set deleted_at = null, deleted_by = null where id = $1', [equipment.id])
      assert.equal((await pg.query('select deleted_at from public.equipments where id = $1', [equipment.id])).rows[0].deleted_at, null)
      await assert.rejects(pg.query('update public.equipments set current_location_id = current_location_id'), /permission denied/)
      await assert.rejects(pg.query('delete from public.equipments'), /permission denied/)
      await assert.rejects(pg.query('insert into public.movement_history (equipment_id) values ($1)', [equipment.id]), /permission denied/)
      await assert.rejects(pg.query('insert into public.admin_users (user_id) values ($1)', [ordinaryId]), /permission denied/)
    })
  })

  await t.test('ordinary authenticated user cannot read or write admin data', async () => {
    await asRole('authenticated', ordinaryId, async () => {
      assert.equal((await pg.query('select * from public.admin_users')).rows.length, 0)
      for (const table of ['equipments', 'categories', 'locations', 'members', 'equipment_images', 'equipment_components', 'movement_history']) {
        assert.equal((await pg.query(`select count(*)::integer as n from public.${table}`)).rows[0].n, 0, table)
      }
      await assert.rejects(pg.query("insert into public.categories (name) values ('侵入')"), /row-level security policy/)
      await assert.rejects(pg.query("insert into public.locations (name) values ('侵入')"), /row-level security policy/)
      await assert.rejects(pg.query("insert into public.members (name) values ('侵入')"), /row-level security policy/)
      await assert.rejects(pg.query(`
        insert into public.equipments (name, category_id, current_location_id, status)
        values ('侵入備品', $1, $2, 'stored')
      `, [targetIds.category_id, targetIds.location_id]), /row-level security policy/)
      assert.equal((await pg.query("update public.equipments set name = '侵入' returning id")).rows.length, 0)
      assert.equal((await pg.query('select private.is_admin() as allowed')).rows[0].allowed, false)
    })
  })

  await t.test('anonymous role cannot access admin tables or RPC', async () => {
    await asRole('anon', ordinaryId, async () => {
      await assert.rejects(pg.query('select * from public.admin_users'), /permission denied/)
      await assert.rejects(pg.query('select * from public.equipments'), /permission denied/)
      await assert.rejects(pg.query("insert into public.categories (name) values ('侵入')"), /permission denied/)
      await assert.rejects(pg.query('select private.is_admin()'), /permission denied/)
      await assert.rejects(pg.query('select public.move_equipment(null,null,null,null,null)'), /permission denied/)
    })
  })
})
