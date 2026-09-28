import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const projectUrl = process.env.SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY
const appUrl = process.env.APP_BASE_URL || 'http://localhost:3000'
assert(projectUrl && secret && publishable, 'Set Supabase keys in .env.local')
const service = createClient(projectUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } })
const bucket = 'equipment-photos'
const suffix = randomUUID()
const password = randomBytes(36).toString('base64url')
let adminId
let ordinaryId
let equipmentId

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
const uploadBody = (bytes, type, name) => {
  const form = new FormData()
  form.set('file', new Blob([bytes], { type }), name)
  return form
}
const photoPath = (id, imageId) => `/api/admin/equipments/${id}/images/${imageId}`

async function request(path, init = {}, cookie = '') {
  const response = await fetch(new URL(path, appUrl), {
    ...init,
    headers: { ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
  })
  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json') ? await response.json() : null
  return { response, data }
}
function json(method, body) { return { method, body: JSON.stringify(body) } }
function status(result, expected, action) {
  assert.equal(result.response.status, expected,
    `${action}: expected ${expected}, got ${result.response.status} ${JSON.stringify(result.data)}`)
}
function cookieHeader(response) { return response.headers.getSetCookie().map((value) => value.split(';', 1)[0]).join('; ') }
async function createUser(email) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  assert.ifError(error)
  return data.user.id
}
async function scoped(email) {
  const auth = createClient(projectUrl, publishable, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await auth.auth.signInWithPassword({ email, password })
  assert.ifError(error)
  const client = createClient(projectUrl, publishable, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return { client, token: data.session.access_token }
}

try {
  const adminEmail = `phase5-admin-${suffix}@example.invalid`
  const ordinaryEmail = `phase5-ordinary-${suffix}@example.invalid`
  adminId = await createUser(adminEmail)
  ordinaryId = await createUser(ordinaryEmail)
  assert.ifError((await service.from('admin_users').insert({ user_id: adminId })).error)
  const login = await request('/api/admin/auth/login', json('POST', { email: adminEmail, password }))
  status(login, 200, 'admin login')
  const cookie = cookieHeader(login.response)
  assert(cookie.includes('kaijofes_admin_access='))

  const category = await service.from('categories').select('id').limit(1).single()
  const location = await service.from('locations').select('id').eq('active', true).limit(1).single()
  assert.ifError(category.error); assert.ifError(location.error)
  const created = await request('/api/admin/equipments', json('POST', {
    name: `写真検証備品-${suffix}`, category_id: category.data.id,
    current_location_id: location.data.id, default_location_id: location.data.id, status: 'stored',
  }), cookie)
  status(created, 201, 'fixture equipment create')
  equipmentId = created.data.item.id
  const endpoint = `/api/admin/equipments/${equipmentId}/images`
  const initial = await request(`/api/equipments/${equipmentId}`)
  status(initial, 200, 'initial public detail')
  assert.deepEqual(initial.data.equipment.images, [])

  const badType = await request(endpoint, { method: 'POST', body: uploadBody(Buffer.from('hello'), 'text/plain', 'bad.txt') }, cookie)
  status(badType, 400, 'invalid file type')
  const fakeImage = await request(endpoint, { method: 'POST', body: uploadBody(Buffer.from('not a PNG'), 'image/png', 'fake.png') }, cookie)
  status(fakeImage, 400, 'fake image signature')
  const tooLarge = await request(endpoint, { method: 'POST', body: uploadBody(Buffer.alloc(4 * 1024 * 1024 + 1), 'image/png', 'large.png') }, cookie)
  assert([400, 413].includes(tooLarge.response.status), 'oversized image was accepted')
  status(await request(endpoint, { method: 'POST', body: uploadBody(png, 'image/png', 'anon.png') }), 401,
    'anonymous upload API')
  console.log('PASS upload validation and anonymous API denial')

  const first = await request(endpoint, { method: 'POST', body: uploadBody(png, 'image/png', 'first.png') }, cookie)
  status(first, 201, 'first photo upload')
  const second = await request(endpoint, { method: 'POST', body: uploadBody(png, 'image/png', 'second.png') }, cookie)
  status(second, 201, 'second photo upload')
  const images = await request(endpoint, {}, cookie)
  status(images, 200, 'admin photo list')
  assert.equal(images.data.items.length, 2)
  assert.equal(images.data.items.filter((image) => image.is_primary).length, 1)
  const firstId = first.data.item.id
  const secondId = second.data.item.id
  const publicList = await request('/api/catalog')
  status(publicList, 200, 'public catalog')
  const publicItem = publicList.data.equipments.find((item) => item.id === equipmentId)
  assert.equal(publicItem.images.length, 2)
  assert.equal(publicItem.images.find((image) => image.is_primary).id, firstId)
  const publicPhoto = await request(`/api/equipments/${equipmentId}/images/${firstId}`)
  status(publicPhoto, 200, 'public active photo')
  assert.equal(publicPhoto.response.headers.get('content-type'), 'image/png')
  const adminPhoto = await request(photoPath(equipmentId, firstId), {}, cookie)
  status(adminPhoto, 200, 'admin photo proxy')
  console.log('PASS multiple uploads, thumbnail metadata and photo reading')

  const ordered = await request(endpoint, json('PATCH', { ordered_ids: [secondId, firstId], primary_id: secondId }), cookie)
  status(ordered, 200, 'reorder and change primary')
  assert.deepEqual(ordered.data.items.map((image) => image.id), [secondId, firstId])
  assert.equal(ordered.data.items.find((image) => image.is_primary).id, secondId)
  const refreshed = await request(`/api/equipments/${equipmentId}`)
  status(refreshed, 200, 'public detail after reorder')
  assert.deepEqual(refreshed.data.equipment.images.map((image) => image.id), [secondId, firstId])
  console.log('PASS reorder and representative image change')

  const firstRow = await service.from('equipment_images').select('storage_path').eq('id', firstId).single()
  assert.ifError(firstRow.error)
  const anon = createClient(projectUrl, publishable, { auth: { persistSession: false, autoRefreshToken: false } })
  const ordinarySession = await scoped(ordinaryEmail)
  const ordinary = ordinarySession.client
  for (const [label, client] of [['anonymous', anon], ['ordinary', ordinary]]) {
    assert((await client.storage.from(bucket).download(firstRow.data.storage_path)).error,
      `${label} read private Storage object`)
    assert((await client.storage.from(bucket).upload(`${equipmentId}/${randomUUID()}.png`, png,
      { contentType: 'image/png' })).error, `${label} uploaded directly to Storage`)
    const deletion = await client.storage.from(bucket).remove([firstRow.data.storage_path])
    const stillThere = await service.storage.from(bucket).download(firstRow.data.storage_path)
    assert.ifError(stillThere.error)
    assert(deletion.error || !deletion.data?.length, `${label} deleted Storage object`)
    const metadata = await client.from('equipment_images').update({ sort_order: 999 }).eq('id', firstId).select()
    assert(metadata.error || metadata.data.length === 0, `${label} reordered metadata directly`)
    const reorder = await client.rpc('set_equipment_image_order', {
      p_equipment_id: equipmentId, p_image_ids: [firstId, secondId], p_primary_id: firstId,
    })
    assert(reorder.error, `${label} changed photo order or primary through RPC`)
    const removeMetadata = await client.rpc('delete_equipment_image', {
      p_equipment_id: equipmentId, p_image_id: firstId,
    })
    assert(removeMetadata.error, `${label} deleted photo metadata through RPC`)
  }
  status(await request(`${endpoint}/${firstId}`, { method: 'DELETE' }), 401, 'anonymous delete API')
  // A non-admin JWT in the cookie must not grant API access.
  status(await request(endpoint, {}, `kaijofes_admin_access=${ordinarySession.token}`), 401,
    'ordinary photo API')
  console.log('PASS direct Storage and metadata manipulation denied')

  status(await request(`/api/admin/equipments/${equipmentId}`, { method: 'DELETE' }, cookie), 200,
    'soft delete equipment')
  status(await request(`/api/equipments/${equipmentId}/images/${firstId}`), 404,
    'deleted equipment public photo')
  status(await request(photoPath(equipmentId, firstId), {}, cookie), 200,
    'deleted equipment admin photo')
  status(await request(endpoint, {}, cookie), 200, 'deleted equipment admin photo list')
  status(await request(`/api/admin/equipments/${equipmentId}/restore`, { method: 'POST' }, cookie), 200,
    'restore equipment')
  status(await request(`/api/equipments/${equipmentId}/images/${firstId}`), 200,
    'restored equipment photo')
  console.log('PASS photos retained through soft delete and restore')

  status(await request(`${endpoint}/${secondId}`, { method: 'DELETE' }, cookie), 200, 'delete primary photo')
  const afterDelete = await request(endpoint, {}, cookie)
  status(afterDelete, 200, 'photo list after delete')
  assert.equal(afterDelete.data.items.length, 1)
  assert.equal(afterDelete.data.items[0].id, firstId)
  assert.equal(afterDelete.data.items[0].is_primary, true)
  status(await request(photoPath(equipmentId, secondId), {}, cookie), 404, 'deleted photo proxy')
  console.log('PASS photo deletion and representative fallback')
  console.log('Live Phase 5 photo checks passed')
} finally {
  if (equipmentId) {
    const objects = await service.storage.from(bucket).list(equipmentId)
    if (!objects.error && objects.data?.length) {
      const paths = objects.data.map((object) => `${equipmentId}/${object.name}`)
      assert.ifError((await service.storage.from(bucket).remove(paths)).error)
    }
    assert.ifError((await service.from('equipment_images').delete().eq('equipment_id', equipmentId)).error)
    assert.ifError((await service.from('equipments').delete().eq('id', equipmentId)).error)
  }
  if (adminId) assert.ifError((await service.from('admin_users').delete().eq('user_id', adminId)).error)
  for (const id of [adminId, ordinaryId]) {
    if (id) assert.ifError((await service.auth.admin.deleteUser(id)).error)
  }
}
