import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY
const app = process.env.APP_BASE_URL || 'http://localhost:3000'
assert(url && secret && publishable, 'Set Supabase keys in .env.local')
const service = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
const suffix = randomUUID()
const password = randomBytes(36).toString('base64url')
const adminEmail = `phase4-admin-${suffix}@example.invalid`
const memberEmail = `phase4-ordinary-${suffix}@example.invalid`
let adminId
let ordinaryId
let equipmentId
let memberId
let locationId
let categoryId

async function api(path, init = {}, cookie = '') {
  const response = await fetch(new URL(path, app), {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
  })
  const data = await response.json().catch(() => ({}))
  return { response, data }
}

function json(method, body) { return { method, body: JSON.stringify(body) } }
function expectStatus(result, status, label) {
  assert.equal(result.response.status, status,
    `${label}: expected ${status}, got ${result.response.status}: ${JSON.stringify(result.data)}`)
}
function cookieHeader(response) {
  return response.headers.getSetCookie().map((entry) => entry.split(';', 1)[0]).join('; ')
}
async function createUser(email) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  assert.ifError(error)
  assert(data.user)
  return data.user.id
}
async function remove(table, id) {
  if (!id) return
  const { error } = await service.from(table).delete().eq('id', id)
  assert.ifError(error)
}

try {
  adminId = await createUser(adminEmail)
  ordinaryId = await createUser(memberEmail)
  const allow = await service.from('admin_users').insert({ user_id: adminId })
  assert.ifError(allow.error)

  expectStatus(await api('/api/admin/equipments'), 401, 'anonymous admin API read')
  expectStatus(await api('/api/admin/categories', json('POST', { name: `illegal-${suffix}` })), 401,
    'anonymous admin API write')
  const ordinaryLogin = await api('/api/admin/auth/login', json('POST', { email: memberEmail, password }))
  expectStatus(ordinaryLogin, 403, 'ordinary user admin login')
  assert.equal(cookieHeader(ordinaryLogin.response), '', 'ordinary user received a session cookie')
  console.log('PASS unauthenticated and ordinary users cannot enter admin API')

  const ordinaryAuth = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } })
  const ordinarySession = await ordinaryAuth.auth.signInWithPassword({ email: memberEmail, password })
  assert.ifError(ordinarySession.error)
  const ordinaryToken = ordinarySession.data.session.access_token
  const ordinaryDb = createClient(url, publishable, {
    global: { headers: { Authorization: `Bearer ${ordinaryToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  for (const table of ['admin_users', 'equipments', 'members', 'categories', 'locations', 'movement_history']) {
    const { data, error } = await ordinaryDb.from(table).select('*').limit(1)
    assert.ifError(error)
    assert.equal(data.length, 0, `ordinary user read ${table}`)
  }
  const deniedInsert = await ordinaryDb.from('categories').insert({ name: `illegal-${suffix}` })
  assert(deniedInsert.error, 'ordinary user inserted a category directly')
  const forgedCookie = `kaijofes_admin_access=${ordinaryToken}`
  expectStatus(await api('/api/admin/equipments', {}, forgedCookie), 401,
    'ordinary JWT in admin cookie')
  expectStatus(await api('/api/admin/locations', json('POST', { name: '侵入' }), forgedCookie), 401,
    'ordinary JWT admin write')
  console.log('PASS database RLS denies ordinary user reads and writes')

  const login = await api('/api/admin/auth/login', json('POST', { email: adminEmail, password }))
  expectStatus(login, 200, 'admin login')
  const cookie = cookieHeader(login.response)
  assert(cookie.includes('kaijofes_admin_access='), 'admin access cookie is missing')
  expectStatus(await api('/api/admin/auth/session', {}, cookie), 200, 'admin session')

  const category = await api('/api/admin/categories', json('POST', { name: `検証カテゴリ-${suffix}` }), cookie)
  expectStatus(category, 201, 'category create')
  categoryId = category.data.item.id
  const location = await api('/api/admin/locations', json('POST', { name: `検証倉庫-${suffix}` }), cookie)
  expectStatus(location, 201, 'location create')
  locationId = location.data.item.id
  const member = await api('/api/admin/members', json('POST', { name: `検証部員-${suffix}` }), cookie)
  expectStatus(member, 201, 'member create')
  memberId = member.data.item.id
  expectStatus(await api(`/api/admin/categories/${categoryId}`, json('PATCH', { sort_order: 20 }), cookie), 200,
    'category edit')
  expectStatus(await api(`/api/admin/locations/${locationId}`, json('PATCH', { description: '検証用' }), cookie), 200,
    'location edit')
  expectStatus(await api(`/api/admin/members/${memberId}`, json('PATCH', { active: false }), cookie), 200,
    'member deactivate')
  expectStatus(await api(`/api/admin/members/${memberId}`, json('PATCH', { active: true }), cookie), 200,
    'member reactivate')
  console.log('PASS admin creates category, location and member')

  const created = await api('/api/admin/equipments', json('POST', {
    name: `検証備品-${suffix}`, category_id: categoryId, default_location_id: locationId,
    current_location_id: locationId, status: 'stored',
  }), cookie)
  expectStatus(created, 201, 'equipment create')
  equipmentId = created.data.item.id
  assert.match(created.data.item.management_number, /^EQ-\d+$/)
  const forbiddenHolderEdit = await api(`/api/admin/equipments/${equipmentId}`, json('PATCH', {
    current_member_id: memberId,
  }), cookie)
  expectStatus(forbiddenHolderEdit, 400, 'holder edit outside movement RPC')
  const edited = await api(`/api/admin/equipments/${equipmentId}`, json('PATCH', {
    name: `更新備品-${suffix}`, status: 'broken',
  }), cookie)
  expectStatus(edited, 200, 'equipment edit')
  assert.equal(edited.data.item.status, 'broken')
  const activeList = await api('/api/admin/equipments?q=' + encodeURIComponent(suffix), {}, cookie)
  expectStatus(activeList, 200, 'equipment list')
  assert(activeList.data.items.some((item) => item.id === equipmentId))
  console.log('PASS admin equipment create, edit and list')

  expectStatus(await api(`/api/admin/equipments/${equipmentId}`, { method: 'DELETE' }, cookie), 200,
    'equipment soft delete')
  const publicCatalog = await api('/api/catalog')
  expectStatus(publicCatalog, 200, 'public catalog')
  assert(!publicCatalog.data.equipments.some((item) => item.id === equipmentId), 'deleted equipment is public')
  const deleted = await api('/api/admin/equipments?deleted=deleted&q=' + encodeURIComponent(suffix), {}, cookie)
  expectStatus(deleted, 200, 'deleted list')
  assert(deleted.data.items.some((item) => item.id === equipmentId))
  expectStatus(await api(`/api/admin/equipments/${equipmentId}/restore`, { method: 'POST' }, cookie), 200,
    'equipment restore')
  const restored = await api(`/api/admin/equipments/${equipmentId}`, {}, cookie)
  expectStatus(restored, 200, 'restored detail')
  assert.equal(restored.data.item.deleted_at, null)
  console.log('PASS soft delete hides public item and restore brings it back')

  const history = await api('/api/admin/history?pageSize=5', {}, cookie)
  expectStatus(history, 200, 'full history')
  assert(history.data.total >= 3, 'seeded movement history is missing')
  const filtered = await api('/api/admin/history?equipmentId=' + encodeURIComponent(equipmentId), {}, cookie)
  expectStatus(filtered, 200, 'history equipment filter')
  assert.equal(filtered.data.total, 0)
  const existing = history.data.items[0]
  const searched = await api('/api/admin/history?q=' + encodeURIComponent(existing.equipment.name), {}, cookie)
  expectStatus(searched, 200, 'history name search')
  assert(searched.data.items.some((item) => item.id === existing.id))
  const byActor = await api('/api/admin/history?actor=' + encodeURIComponent(existing.changed_by_name_snapshot), {}, cookie)
  expectStatus(byActor, 200, 'history actor filter')
  assert(byActor.data.items.some((item) => item.id === existing.id))
  console.log('PASS admin full history and equipment filter')

  const directChange = await ordinaryDb.from('equipments').update({ name: '侵入' }).eq('id', equipmentId).select()
  assert(directChange.error || directChange.data.length === 0, 'ordinary user changed equipment directly')
  const forbiddenApi = await api(`/api/admin/equipments/${equipmentId}`, json('PATCH', { name: '侵入' }))
  expectStatus(forbiddenApi, 401, 'ordinary admin API bypass')
  const csrf = await api(`/api/admin/equipments/${equipmentId}`, {
    ...json('PATCH', { name: '侵入' }), headers: { Origin: 'https://other.example' },
  }, cookie)
  expectStatus(csrf, 403, 'cross-origin admin mutation')
  const adminAuth = await createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.signInWithPassword({ email: adminEmail, password })
  assert.ifError(adminAuth.error)
  const adminDb = createClient(url, publishable, {
    global: { headers: { Authorization: `Bearer ${adminAuth.data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const directHolder = await adminDb.from('equipments').update({ current_member_id: memberId,
    current_location_id: null }).eq('id', equipmentId).select()
  assert(directHolder.error, 'admin JWT moved equipment outside movement RPC')
  const directHistory = await adminDb.from('movement_history').insert({ equipment_id: equipmentId })
  assert(directHistory.error, 'admin JWT inserted movement history')
  console.log('PASS direct privilege escalation is denied')
  const revoked = await service.from('admin_users').delete().eq('user_id', adminId)
  assert.ifError(revoked.error)
  expectStatus(await api('/api/admin/equipments', {}, cookie), 401, 'revoked admin session')
  console.log('PASS admin revocation takes effect immediately')
  console.log('Live Phase 4 checks passed')
} finally {
  // Test fixtures are disposable and have no movement records. Keep existing seed data untouched.
  await remove('equipments', equipmentId)
  await remove('members', memberId)
  await remove('locations', locationId)
  await remove('categories', categoryId)
  if (adminId) {
    const { error } = await service.from('admin_users').delete().eq('user_id', adminId)
    assert.ifError(error)
  }
  for (const id of [adminId, ordinaryId]) {
    if (!id) continue
    const { error } = await service.auth.admin.deleteUser(id)
    assert.ifError(error)
  }
}
