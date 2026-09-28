import assert from 'node:assert/strict'
import { searchEquipments } from '../src/lib/search.ts'

const appUrl = process.env.APP_BASE_URL || 'http://localhost:3000'
const response = await fetch(new URL('/api/catalog', appUrl), { cache: 'no-store' })
assert.equal(response.status, 200, `Catalog returned HTTP ${response.status}`)
const catalog = await response.json()
const item = catalog.equipments.find((equipment) => equipment.name === 'DJI RS 3')
assert(item, 'DJI RS 3 is missing from the live catalog')

for (const query of ['DJI RS 3', 'ジンバル', item.management_number, '動作確認用', '物理部室']) {
  assert(searchEquipments(catalog.equipments, query).some((equipment) => equipment.id === item.id),
    `Live catalog search failed for ${query}`)
}
assert.equal(searchEquipments(catalog.equipments, '存在しない備品999').length, 0)
console.log('PASS live catalog search: name, category, management number, note, location and no-match')
