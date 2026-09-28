import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const projectUrl = process.env.SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY
const appUrl = process.env.APP_BASE_URL || 'http://localhost:3000'
assert(projectUrl && secret && publishable, 'Set Supabase keys in .env.local')
const service = createClient(projectUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } })
const run = promisify(execFile)
const tables = ['equipments', 'equipment_components', 'equipment_images', 'categories',
  'locations', 'members', 'movement_history']
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
const suffix = randomUUID()
const password = randomBytes(36).toString('base64url')
const temp = await mkdtemp(join(tmpdir(), 'kaijofes-backup-'))
let adminId
let ordinaryId
let equipmentId

async function request(path, init = {}, cookie = '') {
  return fetch(new URL(path, appUrl), {
    ...init,
    headers: { ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
  })
}
async function json(path, init = {}, cookie = '') {
  const response = await request(path, init, cookie)
  const body = await response.json().catch(() => ({}))
  return { response, body }
}
function status(response, expected, label) { assert.equal(response.status, expected, `${label}: HTTP ${response.status}`) }
function cookies(response) { return response.headers.getSetCookie().map((value) => value.split(';', 1)[0]).join('; ') }
async function createUser(email) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  assert.ifError(error)
  return data.user.id
}
async function counts() {
  const result = {}
  for (const table of tables) {
    const { count, error } = await service.from(table).select('id', { head: true, count: 'exact' })
    assert.ifError(error)
    result[table] = count
  }
  return result
}
async function zipText(archive, path) {
  const { stdout } = await run('unzip', ['-p', archive, path], { maxBuffer: 32 * 1024 * 1024 })
  return stdout
}

try {
  const adminEmail = `phase6-admin-${suffix}@example.invalid`
  const ordinaryEmail = `phase6-ordinary-${suffix}@example.invalid`
  adminId = await createUser(adminEmail)
  ordinaryId = await createUser(ordinaryEmail)
  assert.ifError((await service.from('admin_users').insert({ user_id: adminId })).error)
  const login = await json('/api/admin/auth/login', {
    method: 'POST', body: JSON.stringify({ email: adminEmail, password }),
  })
  status(login.response, 200, 'admin login')
  const cookie = cookies(login.response)

  const category = await service.from('categories').select('id').limit(1).single()
  const location = await service.from('locations').select('id').eq('active', true).limit(1).single()
  assert.ifError(category.error); assert.ifError(location.error)
  const created = await json('/api/admin/equipments', { method: 'POST', body: JSON.stringify({
    name: `バックアップ検証備品-${suffix}`, category_id: category.data.id,
    current_location_id: location.data.id, status: 'stored',
  }) }, cookie)
  status(created.response, 201, 'fixture equipment')
  equipmentId = created.body.item.id
  const form = new FormData()
  form.set('file', new Blob([png], { type: 'image/png' }), 'backup.png')
  const uploaded = await json(`/api/admin/equipments/${equipmentId}/images`, { method: 'POST', body: form }, cookie)
  status(uploaded.response, 201, 'fixture photo')
  const photoRow = await service.from('equipment_images').select('storage_path').eq('id', uploaded.body.item.id).single()
  assert.ifError(photoRow.error)
  const photoPath = photoRow.data.storage_path
  status(await request(`/api/admin/equipments/${equipmentId}`, { method: 'DELETE' }, cookie), 200,
    'fixture soft deletion')
  const before = await counts()
  const beforeFixture = await service.from('equipments').select('updated_at,deleted_at')
    .eq('id', equipmentId).single()
  assert.ifError(beforeFixture.error)

  status(await request('/api/admin/backup'), 401, 'anonymous ZIP access')
  status(await request('/api/admin/backup/equipments.csv'), 401, 'anonymous CSV access')
  const ordinaryAuth = createClient(projectUrl, publishable, { auth: { persistSession: false, autoRefreshToken: false } })
  const ordinarySession = await ordinaryAuth.auth.signInWithPassword({ email: ordinaryEmail, password })
  assert.ifError(ordinarySession.error)
  const forged = `kaijofes_admin_access=${ordinarySession.data.session.access_token}`
  status(await request('/api/admin/backup', {}, forged), 401, 'ordinary user ZIP access')
  status(await request('/api/admin/backup/equipments.csv', {}, forged), 401, 'ordinary user CSV access')
  console.log('PASS anonymous and ordinary users cannot download backups')

  const archiveResponse = await request('/api/admin/backup', {}, cookie)
  status(archiveResponse, 200, 'backup ZIP')
  assert.match(archiveResponse.headers.get('content-type') || '', /application\/zip/)
  assert.match(archiveResponse.headers.get('content-disposition') || '', /attachment/)
  const archive = join(temp, 'backup.zip')
  await writeFile(archive, Buffer.from(await archiveResponse.arrayBuffer()))
  const { stdout: integrity } = await run('unzip', ['-t', archive], { maxBuffer: 32 * 1024 * 1024 })
  assert.match(integrity, /No errors detected/)
  const { stdout: listing } = await run('unzip', ['-Z1', archive], { maxBuffer: 32 * 1024 * 1024 })
  const paths = new Set(listing.trimEnd().split('\n'))
  for (const table of tables) assert(paths.has(`${table}.json`), `${table}.json is missing`)
  assert(paths.has('equipments.csv'))
  assert(paths.has('metadata.json'))
  assert(paths.has(`photos/${photoPath}`), 'photo file is missing')
  const manifest = JSON.parse(await zipText(archive, 'metadata.json'))
  assert.equal(manifest.archive_format, 'kaijofes-inventory-backup')
  assert.equal(manifest.backup_format_version, 1)
  assert.match(manifest.schema_version, /^\d{14}$/)
  assert.equal(manifest.app_version, (JSON.parse(await readFile(new URL('../package.json', import.meta.url))).version))
  assert(Date.parse(manifest.completed_at) >= Date.parse(manifest.started_at))
  assert.equal(manifest.photo_count, before.equipment_images)
  for (const table of tables) {
    const rows = JSON.parse(await zipText(archive, `${table}.json`))
    assert.equal(rows.length, before[table], `${table} was truncated`)
    assert.equal(manifest.table_counts[table], rows.length)
  }
  const equipments = JSON.parse(await zipText(archive, 'equipments.json'))
  const fixture = equipments.find((item) => item.id === equipmentId)
  assert(fixture?.deleted_at, 'soft-deleted equipment is missing')
  const images = JSON.parse(await zipText(archive, 'equipment_images.json'))
  assert(images.some((image) => image.equipment_id === equipmentId && image.storage_path === photoPath))
  const { stdout: archivedPhoto } = await run('unzip', ['-p', archive, `photos/${photoPath}`], { encoding: 'buffer' })
  assert.deepEqual(archivedPhoto, png)
  const csvInZip = await zipText(archive, 'equipments.csv')
  assert(csvInZip.includes(fixture.management_number))
  const unpacked = join(temp, 'unpacked')
  await run('unzip', ['-q', archive, '-d', unpacked])
  const { stdout: restorePreview } = await run(process.execPath,
    ['scripts/restore-backup.mjs', unpacked])
  assert.match(restorePreview, /Preview only/)
  console.log('PASS ZIP contains complete JSON, deleted equipment, CSV, photo and version metadata')

  const csvResponse = await request('/api/admin/backup/equipments.csv', {}, cookie)
  status(csvResponse, 200, 'direct equipment CSV')
  assert.match(csvResponse.headers.get('content-type') || '', /text\/csv/)
  const csv = await csvResponse.text()
  assert(csv.includes(fixture.management_number))
  assert(csv.includes('deleted_at'))
  assert.deepEqual(await counts(), before, 'backup changed table row counts')
  const afterFixture = await service.from('equipments').select('updated_at,deleted_at').eq('id', equipmentId).single()
  assert.ifError(afterFixture.error)
  assert.deepEqual(afterFixture.data, beforeFixture.data, 'backup changed equipment')
  assert.ifError((await service.storage.from('equipment-photos').download(photoPath)).error)
  console.log('PASS direct CSV export and read-only backup behavior')
  console.log('Live Phase 6 backup checks passed')
} finally {
  if (equipmentId) {
    const objects = await service.storage.from('equipment-photos').list(equipmentId)
    if (!objects.error && objects.data?.length) {
      assert.ifError((await service.storage.from('equipment-photos').remove(
        objects.data.map((entry) => `${equipmentId}/${entry.name}`),
      )).error)
    }
    assert.ifError((await service.from('equipment_images').delete().eq('equipment_id', equipmentId)).error)
    assert.ifError((await service.from('equipments').delete().eq('id', equipmentId)).error)
  }
  if (adminId) assert.ifError((await service.from('admin_users').delete().eq('user_id', adminId)).error)
  for (const id of [adminId, ordinaryId]) if (id) assert.ifError((await service.auth.admin.deleteUser(id)).error)
  await rm(temp, { recursive: true, force: true })
}
