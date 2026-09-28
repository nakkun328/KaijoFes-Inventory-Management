import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const directory = process.argv[2] && resolve(process.argv[2])
const targetIndex = process.argv.indexOf('--expected-project-ref')
const targetRef = targetIndex >= 0 ? process.argv[targetIndex + 1] : undefined
const deletedByIndex = process.argv.indexOf('--deleted-by-id')
const deletedById = deletedByIndex >= 0 ? process.argv[deletedByIndex + 1] : undefined
assert(directory, 'Usage: npm run test:restore-live -- <extracted-directory> --expected-project-ref <ref> [--deleted-by-id <auth-uuid>]')
assert(/^[a-z0-9]{20}$/.test(targetRef || ''), 'Use --expected-project-ref <target-project-ref>')

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
assert(url && key, 'Set restore target variables in .env.restore.local')
assert.equal(new URL(url).hostname, `${targetRef}.supabase.co`, 'Target ref does not match SUPABASE_URL')

const tables = [
  'categories', 'locations', 'members', 'equipments',
  'equipment_components', 'equipment_images', 'movement_history',
]
const metadata = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8'))
assert.equal(metadata.archive_format, 'kaijofes-inventory-backup')
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function allRows(table) {
  const rows = []
  let after = null
  while (true) {
    let query = client.from(table).select('*').order('id', { ascending: true }).limit(500)
    if (after) query = query.gt('id', after)
    const { data, error } = await query
    assert.ifError(error)
    rows.push(...data)
    if (data.length < 500) break
    after = data.at(-1).id
  }
  return rows
}

for (const table of tables) {
  const expected = JSON.parse(await readFile(join(directory, `${table}.json`), 'utf8'))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((row) => table === 'equipments' && row.deleted_at
      ? { ...row, deleted_by: deletedById } : row)
  assert.equal(expected.length, metadata.table_counts[table], `${table} archive count mismatch`)
  if (table === 'equipments' && expected.some((row) => row.deleted_at))
    assert(deletedById, 'Pass --deleted-by-id used during restore')
  const actual = await allRows(table)
  assert.deepEqual(actual, expected, `${table} differs from backup`)
  console.log(`PASS ${table}: ${actual.length}`)
}

const images = JSON.parse(await readFile(join(directory, 'equipment_images.json'), 'utf8'))
assert.equal(images.length, metadata.photo_count)
for (const image of images) {
  const expected = await readFile(join(directory, 'photos', image.storage_path))
  const { data, error } = await client.storage.from('equipment-photos').download(image.storage_path)
  assert.ifError(error)
  assert.deepEqual(Buffer.from(await data.arrayBuffer()), expected, `Photo differs: ${image.storage_path}`)
}
console.log(`PASS photos: ${images.length}`)
console.log('Restore verification passed')
