import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrations = await Promise.all([
  '20260928000100_initial.sql',
  '20260928000200_admin.sql',
  '20260928000300_admin_constraints.sql',
  '20260928000400_photos.sql',
  '20260928000500_photo_size_limit.sql',
].map((name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')))
const seed = await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8')
const adminId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const ordinaryId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
const image1 = '11111111-1111-4111-8111-111111111111'
const image2 = '22222222-2222-4222-8222-222222222222'
const missing = '33333333-3333-4333-8333-333333333333'

test('photo metadata RPCs and Storage policies require an allowlisted admin', async (t) => {
  const pg = new PGlite()
  t.after(async () => { await pg.close() })
  await pg.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create schema storage;
    create table storage.buckets (
      id text primary key, name text not null, public boolean not null,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects (bucket_id text not null, name text not null);
    alter table storage.objects enable row level security;
    create role service_role;
    create role anon;
    create role authenticated;
  `)
  for (const migration of migrations) await pg.exec(migration)
  await pg.exec(seed)
  await pg.query('insert into auth.users (id) values ($1), ($2)', [adminId, ordinaryId])
  await pg.query('insert into public.admin_users (user_id) values ($1)', [adminId])
  await pg.exec(`
    grant usage on schema auth, public, storage to anon, authenticated;
    grant execute on function auth.uid() to authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
  `)
  const bucket = (await pg.query("select * from storage.buckets where id = 'equipment-photos'")).rows[0]
  assert.equal(bucket.public, false)
  assert.equal(bucket.file_size_limit, 4194304)
  assert.deepEqual(bucket.allowed_mime_types, ['image/jpeg', 'image/png', 'image/webp'])

  const equipmentId = (await pg.query("select id from public.equipments where name = 'DJI RS 3'")).rows[0].id
  const path1 = `${equipmentId}/${image1}.jpg`
  const path2 = `${equipmentId}/${image2}.webp`

  async function asRole(role, uid, fn) {
    await pg.exec(`set request.jwt.claim.sub = '${uid}'; set role ${role};`)
    try { await fn() } finally { await pg.exec('reset role; reset request.jwt.claim.sub;') }
  }

  await t.test('administrator can upload metadata, reorder, and delete with primary fallback', async () => {
    await asRole('authenticated', adminId, async () => {
      await pg.query('insert into storage.objects (bucket_id, name) values ($1, $2)', ['equipment-photos', path1])
      await pg.query('insert into storage.objects (bucket_id, name) values ($1, $2)', ['equipment-photos', path2])
      await pg.query('insert into public.equipment_images (id, equipment_id, storage_path, sort_order, is_primary) values ($1, $2, $3, 0, true), ($4, $2, $5, 1, false)', [image1, equipmentId, path1, image2, path2])
      await assert.rejects(pg.query('insert into public.equipment_images (equipment_id, storage_path) values ($1, $2)', [equipmentId, path1]), /unique/)
      await assert.rejects(pg.query('insert into public.equipment_images (equipment_id, storage_path) values ($1, $2)', [equipmentId, 'wrong/path.jpg']), /check constraint/)

      await pg.query('select public.set_equipment_image_order($1, $2::uuid[], $3)', [equipmentId, [image2, image1], image2])
      let images = (await pg.query('select id, sort_order, is_primary from public.equipment_images where equipment_id = $1 order by sort_order', [equipmentId])).rows
      assert.deepEqual(images.map((image) => image.id), [image2, image1])
      assert.deepEqual(images.map((image) => image.is_primary), [true, false])
      await assert.rejects(pg.query('select public.set_equipment_image_order($1, $2::uuid[], $3)', [equipmentId, [image2, image2], image2]), /invalid_image_order/)
      await assert.rejects(pg.query('select public.set_equipment_image_order($1, $2::uuid[], $3)', [equipmentId, [image1, missing], image1]), /invalid_image_order/)
      images = (await pg.query('select id, sort_order, is_primary from public.equipment_images where equipment_id = $1 order by sort_order', [equipmentId])).rows
      assert.deepEqual(images.map((image) => image.id), [image2, image1])

      const deleted = await pg.query('select public.delete_equipment_image($1, $2) as path', [equipmentId, image2])
      assert.equal(deleted.rows[0].path, path2)
      images = (await pg.query('select id, is_primary from public.equipment_images where equipment_id = $1', [equipmentId])).rows
      assert.deepEqual(images, [{ id: image1, is_primary: true }])
      await assert.rejects(pg.query('delete from public.equipment_images where id = $1', [image1]), /permission denied/)
      await assert.rejects(pg.query('update public.equipment_images set is_primary = false where id = $1', [image1]), /permission denied/)
      assert.equal((await pg.query('update storage.objects set name = name where name = $1 returning name', [path1])).rows.length, 0)

      await pg.query('update public.equipments set deleted_at = now(), deleted_by = $1 where id = $2', [adminId, equipmentId])
      assert.equal((await pg.query('select count(*)::integer as n from public.equipment_images where equipment_id = $1', [equipmentId])).rows[0].n, 1)
      assert.equal((await pg.query('select count(*)::integer as n from storage.objects where name = $1', [path1])).rows[0].n, 1)
      await pg.query('update public.equipments set deleted_at = null, deleted_by = null where id = $1', [equipmentId])
      assert.equal((await pg.query('select count(*)::integer as n from public.equipment_images where equipment_id = $1', [equipmentId])).rows[0].n, 1)
    })
  })

  await t.test('ordinary Auth user cannot access metadata, RPC, or Storage', async () => {
    await asRole('authenticated', ordinaryId, async () => {
      assert.equal((await pg.query('select * from public.equipment_images')).rows.length, 0)
      assert.equal((await pg.query('select * from storage.objects')).rows.length, 0)
      await assert.rejects(pg.query('insert into storage.objects (bucket_id, name) values ($1, $2)', ['equipment-photos', `${equipmentId}/${missing}.png`]), /row-level security policy/)
      await assert.rejects(pg.query('insert into public.equipment_images (equipment_id, storage_path) values ($1, $2)', [equipmentId, `${equipmentId}/${missing}.png`]), /row-level security policy/)
      await assert.rejects(pg.query('select public.set_equipment_image_order($1, $2::uuid[], $3)', [equipmentId, [image1], image1]), /admin_required/)
      await assert.rejects(pg.query('select public.delete_equipment_image($1, $2)', [equipmentId, image1]), /admin_required/)
      assert.equal((await pg.query('delete from storage.objects where bucket_id = $1 returning name', ['equipment-photos'])).rows.length, 0)
      assert.equal((await pg.query('update storage.objects set name = name where bucket_id = $1 returning name', ['equipment-photos'])).rows.length, 0)
    })
  })

  await t.test('anonymous caller cannot access photo metadata or Storage', async () => {
    await asRole('anon', ordinaryId, async () => {
      await assert.rejects(pg.query('select * from public.equipment_images'), /permission denied/)
      await assert.rejects(pg.query('select * from storage.objects'), /permission denied/)
      await assert.rejects(pg.query('select public.delete_equipment_image($1, $2)', [equipmentId, image1]), /permission denied/)
    })
  })
})
