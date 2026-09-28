import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const projectUrl = process.env.SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
const appUrl = process.env.APP_BASE_URL || 'http://localhost:3000'
assert(projectUrl && secretKey && publishableKey, 'Set SUPABASE_URL, SUPABASE_SECRET_KEY and SUPABASE_PUBLISHABLE_KEY in .env.local')
assert(!projectUrl.includes('YOUR_PROJECT') && !secretKey.includes('REPLACE_WITH') &&
  !publishableKey.includes('REPLACE_WITH'), 'Replace all .env.local examples with your project values')

const admin = createClient(projectUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

async function appGet(path) {
  const response = await fetch(new URL(path, appUrl), { cache: 'no-store' })
  assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`)
  return response.json()
}

async function appMove(id, toType, toId, actorId, expectedUpdatedAt, expectedStatus = 200) {
  const response = await fetch(new URL(`/api/equipments/${id}/move`, appUrl), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toType, toId, actorId, expectedUpdatedAt }),
  })
  assert.equal(response.status, expectedStatus, `Move returned HTTP ${response.status}; expected ${expectedStatus}`)
  return response.json()
}

async function historyCount(id) {
  const { count, error } = await admin.from('movement_history')
    .select('id', { count: 'exact', head: true }).eq('equipment_id', id)
  assert.ifError(error)
  return count
}

async function directRequest(path, init = {}) {
  return fetch(new URL(`/rest/v1/${path}`, projectUrl), {
    ...init,
    headers: { apikey: publishableKey, ...(init.headers || {}) },
  })
}

function assertDenied(response, action) {
  assert([401, 403].includes(response.status), `${action} was not denied (HTTP ${response.status})`)
}

const catalog = await appGet('/api/catalog')
assert(catalog.equipments.length >= 2, 'Seeded equipment list is missing')
const item = catalog.equipments.find((equipment) => equipment.name === 'DJI RS 3')
const sato = catalog.members.find((member) => member.name === '佐藤')
const tanaka = catalog.members.find((member) => member.name === '田中')
const room = catalog.locations.find((location) => location.name === '物理部室')
assert(item && sato && tanaka && room, 'Seeded equipment, members or location is missing')
assert(catalog.categories.length > 0, 'Seeded categories are missing')
console.log('PASS equipment catalog')

let detail = await appGet(`/api/equipments/${item.id}`)
assert.equal(detail.equipment.name, 'DJI RS 3')
assert.equal(detail.equipment.holder.name, '北倉庫', 'Live test requires fresh seed data')
assert.equal(detail.equipment.status, 'stored')
console.log('PASS equipment detail and initial location')

// The publishable key exercises the same anonymous database role as a browser.
assertDenied(await directRequest('equipments?select=id&limit=1'), 'Anonymous equipment read')
for (const [table, id, name] of [
  ['equipments', item.id, item.name],
  ['members', sato.id, sato.name],
  ['categories', catalog.categories[0].id, catalog.categories[0].name],
  ['locations', room.id, room.name],
]) {
  assertDenied(await directRequest(`${table}?id=eq.${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ name }),
  }), `Anonymous ${table} update`)
}
assertDenied(await directRequest('rpc/move_equipment', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    p_equipment_id: '00000000-0000-0000-0000-000000000000',
    p_to_type: 'member', p_to_id: sato.id,
    p_changed_by_member_id: sato.id,
    p_expected_updated_at: detail.equipment.updated_at,
  }),
}), 'Anonymous movement RPC')
console.log('PASS direct anonymous access is denied')

const beforeCount = await historyCount(item.id)
const initialTimestamp = detail.equipment.updated_at
await appMove(item.id, 'member', sato.id, sato.id, initialTimestamp)
detail = await appGet(`/api/equipments/${item.id}`)
assert.equal(detail.equipment.holder.name, '佐藤')
assert.equal(detail.equipment.status, 'borrowed')
assert.equal(detail.latest.from_name_snapshot, '北倉庫')
assert.equal(detail.latest.to_name_snapshot, '佐藤')
console.log('PASS 北倉庫 → 佐藤')

await appMove(item.id, 'member', tanaka.id, sato.id, detail.equipment.updated_at)
detail = await appGet(`/api/equipments/${item.id}`)
assert.equal(detail.equipment.holder.name, '田中')
assert.equal(detail.equipment.status, 'borrowed')
assert.equal(detail.latest.from_name_snapshot, '佐藤')
assert.equal(detail.latest.to_name_snapshot, '田中')
console.log('PASS 佐藤 → 田中')

await appMove(item.id, 'location', room.id, tanaka.id, detail.equipment.updated_at)
detail = await appGet(`/api/equipments/${item.id}`)
assert.equal(detail.equipment.holder.name, '物理部室')
assert.equal(detail.equipment.status, 'stored')
assert.equal(detail.latest.from_name_snapshot, '田中')
assert.equal(detail.latest.to_name_snapshot, '物理部室')
assert.equal(await historyCount(item.id), beforeCount + 3)
console.log('PASS 田中 → 物理部室 and three history entries')

await appMove(item.id, 'member', sato.id, sato.id, initialTimestamp, 409)
const afterStale = await appGet(`/api/equipments/${item.id}`)
assert.equal(afterStale.equipment.holder.name, '物理部室')
assert.equal(await historyCount(item.id), beforeCount + 3)
console.log('PASS stale update rejected without extra history')
console.log('Live Phase 1–3 API checks passed')
