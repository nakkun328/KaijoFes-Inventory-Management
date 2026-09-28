import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// Restore only into a new, migrated, empty project. Preview is the default.
const directory = process.argv[2] && resolve(process.argv[2])
const apply = process.argv.includes('--apply')
const deletedByOption = process.argv.indexOf('--deleted-by-id')
const deletedById = deletedByOption >= 0 ? process.argv[deletedByOption + 1] : undefined
const targetOption = process.argv.indexOf('--expected-project-ref')
const expectedProjectRef = targetOption >= 0 ? process.argv[targetOption + 1] : undefined
assert(directory, 'Usage: npm run restore:backup -- <extracted-directory> [--apply --deleted-by-id <new-admin-auth-uuid>]')

const tables = [
  'categories', 'locations', 'members', 'equipments',
  'equipment_components', 'equipment_images', 'movement_history',
]
const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
  .filter((file) => /^\d{14}_.+\.sql$/.test(file)).sort()
const currentSchema = migrations.at(-1)?.slice(0, 14)
const metadata = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8'))
assert.equal(metadata.archive_format, 'kaijofes-inventory-backup')
assert.equal(metadata.backup_format_version, 1, 'Unsupported backup format version')
assert.equal(metadata.schema_version, currentSchema,
  `Archive schema ${metadata.schema_version} differs from this checkout ${currentSchema}; use matching code/migrations`)
assert.equal(metadata.storage_bucket, 'equipment-photos')
assert.equal(metadata.photo_directory, 'photos/')

const rows = {}
for (const table of tables) {
  rows[table] = JSON.parse(await readFile(join(directory, `${table}.json`), 'utf8'))
  assert(Array.isArray(rows[table]), `${table}.json must be an array`)
  assert.equal(rows[table].length, metadata.table_counts[table], `${table} count mismatch`)
  assert(rows[table].every((row) => typeof row?.id === 'string'), `${table} contains an invalid row`)
}

const photoPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/i
assert.equal(rows.equipment_images.length, metadata.photo_count, 'Photo count mismatch')
for (const image of rows.equipment_images) {
  assert(photoPattern.test(image.storage_path), `Unsafe photo path: ${image.storage_path}`)
  assert((await stat(join(directory, 'photos', image.storage_path))).isFile(),
    `Photo is missing: ${image.storage_path}`)
}

const removed = rows.equipments.filter((row) => row.deleted_at)
if (removed.length) {
  assert(!apply || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deletedById || ''),
    'Deleted equipment requires --deleted-by-id <new-admin-auth-uuid>')
}

console.log(`Archive: ${metadata.started_at}; schema ${metadata.schema_version}; app ${metadata.app_version}`)
for (const table of tables) console.log(`${table}: ${rows[table].length}`)
console.log(`Photos: ${metadata.photo_count}; deleted equipments: ${removed.length}`)
if (!apply) {
  console.log('Preview only. To restore into a new empty project, add --apply and --expected-project-ref; add --deleted-by-id if required.')
  process.exit(0)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
assert(url && key, 'Set target SUPABASE_URL and SUPABASE_SECRET_KEY in local .env.local')
assert(/^[a-z0-9]{20}$/.test(expectedProjectRef || ''), 'Use --expected-project-ref <target-project-ref>')
assert.equal(new URL(url).hostname, `${expectedProjectRef}.supabase.co`,
  'SUPABASE_URL does not match --expected-project-ref')
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
for (const table of tables) {
  const { count, error } = await client.from(table).select('id', { head: true, count: 'exact' })
  assert.ifError(error)
  assert.equal(count, 0, `Target ${table} is not empty. Use a fresh project; restore will not overwrite data.`)
}
if (removed.length) {
  const { data, error } = await client.auth.admin.getUserById(deletedById)
  assert.ifError(error)
  assert(data.user, 'The replacement deleted_by Auth user does not exist in the target project')
}

// Parent rows first, followed by referenced rows. Preserve UUIDs and timestamps.
for (const table of tables) {
  const items = table === 'equipments'
    ? rows.equipments.map((row) => row.deleted_at ? { ...row, deleted_by: deletedById } : row)
    : rows[table]
  for (let offset = 0; offset < items.length; offset += 250) {
    const { error } = await client.from(table).insert(items.slice(offset, offset + 250))
    if (error) throw new Error(`Could not restore ${table} rows ${offset + 1}–${Math.min(offset + 250, items.length)}: ${error.message}`)
  }
  console.log(`Restored ${table}: ${items.length}`)
}

for (const image of rows.equipment_images) {
  const path = image.storage_path
  const extension = path.split('.').at(-1).toLowerCase()
  const contentType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`
  const contents = await readFile(join(directory, 'photos', path))
  const { error } = await client.storage.from('equipment-photos').upload(path, contents,
    { contentType, upsert: false })
  if (error) throw new Error(`Could not restore photo ${path}: ${error.message}`)
}
console.log(`Restored photos: ${rows.equipment_images.length}`)
console.log('Restore complete. Run supabase/reset_management_sequence.sql in the target SQL Editor, then verify counts and images.')
