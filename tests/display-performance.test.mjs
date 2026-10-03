import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import ts from 'typescript'
import sharp from 'sharp'

const require = createRequire(import.meta.url)
async function load(relative, replacements = []) {
  let source = (await readFile(new URL(relative, import.meta.url), 'utf8')).replace("import 'server-only'", '')
  for (const [from, to] of replacements) source = source.replace(from, to)
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
}
const { groupEquipments } = await load('../src/lib/equipment-groups.ts')
const { photoResponse } = await load('../src/lib/photo-response.ts', [["from 'sharp'", `from '${pathToFileURL(require.resolve('sharp')).href}'`]])

test('category grouping respects configured order, including after search filtering', () => {
  const categories = [{ id: 'z', name: '通信' }, { id: 'a', name: '音響' }, { id: 'empty', name: '空' }]
  const items = [{ id: '1', category: categories[1] }, { id: '2', category: categories[0] }, { id: '3', category: categories[0] }]
  assert.deepEqual(groupEquipments(items, 'category', categories).map(([name, rows]) => [name, rows.map(row => row.id)]), [['通信', ['2', '3']], ['音響', ['1']]])
  assert.deepEqual(groupEquipments(items.slice(0, 2), 'category', categories).map(([name]) => name), ['通信', '音響'])
  assert.deepEqual(groupEquipments([], 'category', categories), [])
  assert.deepEqual(groupEquipments(items, 'all', categories), [['すべて', items]])
})

test('thumbnail is bounded, substantially smaller, and original bytes remain available', async () => {
  const raw = Buffer.alloc(1200 * 900 * 3)
  let random = 1
  for (let i = 0; i < raw.length; i++) { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; raw[i] = random >>> 24 }
  const png = await sharp(raw, { raw: { width: 1200, height: 900, channels: 3 } }).png().toBuffer()
  const download = async () => new Blob([png])
  const small = await photoResponse(new Request('https://example.test/photo?width=160'), 'immutable.png', download)
  const bytes = Buffer.from(await small.arrayBuffer())
  const metadata = await sharp(bytes).metadata()
  assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 160); assert.equal(metadata.height, 120)
  assert(bytes.length < png.length / 10)
  assert.equal(small.headers.get('cache-control'), 'private, no-cache')
  const original = await photoResponse(new Request('https://example.test/photo'), 'immutable.png', download)
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), png)
  assert.notEqual(small.headers.get('etag'), original.headers.get('etag'))
})

test('validated unchanged image does not redownload Storage, and variants cannot share an ETag', async () => {
  const photo = await sharp({ create: { width: 20, height: 30, channels: 4, background: { r: 0, g: 100, b: 10, alpha: 0.5 } } }).png().toBuffer()
  let downloads = 0
  const download = async () => { downloads++; return new Blob([photo]) }
  const first = await photoResponse(new Request('https://example.test/photo?width=160'), 'immutable.png', download)
  const unchanged = await photoResponse(new Request('https://example.test/photo?width=160', { headers: { 'If-None-Match': `W/${first.headers.get('etag')}` } }), 'immutable.png', download)
  assert.equal(unchanged.status, 304); assert.equal(downloads, 1); assert.equal((await unchanged.arrayBuffer()).byteLength, 0)
  const another = await photoResponse(new Request('https://example.test/photo?width=640', { headers: { 'If-None-Match': first.headers.get('etag') } }), 'immutable.png', download)
  assert.equal(another.status, 200); assert.equal(downloads, 2)
  const metadata = await sharp(Buffer.from(await another.arrayBuffer())).metadata()
  assert.equal(metadata.width, 20); assert.equal(metadata.height, 30); assert.equal(metadata.hasAlpha, true)
})

test('deleted equipment/photo stays unavailable even with a matching browser validator', async () => {
  const cached = await photoResponse(new Request('https://example.test/photo'), 'immutable.png', async () => new Blob(['old photo']))
  const route = await load('../src/app/api/equipments/[id]/images/[imageId]/route.ts', [
    ["import { db } from '@/lib/supabase'", "const db = () => ({ from: () => ({ select() { return this }, eq() { return this }, is() { return this }, async maybeSingle() { return {data:null,error:null} } }), storage: { from() { throw new Error('Storage must not be touched') } } })"],
    ["import { photoResponse } from '@/lib/photo-response'", "const photoResponse = () => { throw new Error('Missing photos must not revalidate cached bytes') }"],
  ])
  const response = await route.GET(new Request('https://example.test/photo', { headers: { 'If-None-Match': cached.headers.get('etag') } }), { params: Promise.resolve({ id: '10000000-0000-4000-8000-000000000001', imageId: '20000000-0000-4000-8000-000000000001' }) })
  assert.equal(response.status, 404)
})
