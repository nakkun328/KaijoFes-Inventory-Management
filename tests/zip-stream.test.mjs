import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/lib/zip-stream.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { createZipStream } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const run = promisify(execFile)
const utf8 = (value) => new TextEncoder().encode(value)

test('ZIP stream produces an extractable archive with JSON, CSV, photos, and UTF-8 paths', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'kaijofes-zip-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const archivePath = join(directory, 'backup.zip')
  let photoRead = false
  const photo = new ReadableStream({
    pull(controller) {
      photoRead = true
      controller.enqueue(Uint8Array.from([0, 1, 2, 255]))
      controller.close()
    },
  })
  const entries = async function* () {
    yield { path: 'metadata.json', data: utf8('{"schema_version":1}') }
    yield { path: 'equipments.csv', data: utf8('id,name\n1,ジンバル\n') }
    yield { path: 'photos/備品-01/photo.jpg', data: photo }
    for (let i = 0; i < 100; i++) {
      yield { path: `photos/many/${i.toString().padStart(3, '0')}.jpg`, data: utf8(`photo-${i}`) }
    }
  }
  const zip = createZipStream(entries())
  assert.equal(photoRead, false)
  const bytes = new Uint8Array(await new Response(zip).arrayBuffer())
  assert.equal(photoRead, true)
  await writeFile(archivePath, bytes)
  const { stdout: integrity } = await run('unzip', ['-t', archivePath])
  assert.match(integrity, /No errors detected/)
  const { stdout: listing } = await run('unzip', ['-Z1', archivePath])
  assert.equal(listing.trimEnd().split('\n').length, 103)
  const { stdout: metadata } = await run('unzip', ['-p', archivePath, 'metadata.json'])
  assert.equal(metadata, '{"schema_version":1}')
  const { stdout: csv } = await run('unzip', ['-p', archivePath, 'equipments.csv'])
  assert.equal(csv, 'id,name\n1,ジンバル\n')
  const { stdout: binary } = await run('unzip', ['-p', archivePath, 'photos/*/photo.jpg'], { encoding: 'buffer' })
  assert.deepEqual(binary, Buffer.from([0, 1, 2, 255]))
})

test('ZIP stream emits file bytes incrementally and accepts async iterable data', async () => {
  let nextChunk
  const blocked = new Promise((resolve) => { nextChunk = resolve })
  let reachedSecondChunk = false
  const data = async function* () {
    yield utf8('first')
    await blocked
    reachedSecondChunk = true
    yield utf8('second')
  }
  const reader = createZipStream([{ path: 'stream.txt', data: data() }]).getReader()
  const header = await reader.read()
  assert.equal(header.done, false)
  assert.equal(new DataView(header.value.buffer).getUint32(0, true), 0x04034b50)
  const first = await reader.read()
  assert.equal(new TextDecoder().decode(first.value), 'first')
  assert.equal(reachedSecondChunk, false)
  nextChunk()
  const second = await reader.read()
  assert.equal(new TextDecoder().decode(second.value), 'second')
  await reader.cancel()
})

test('ZIP stream rejects unsafe and duplicate paths', async () => {
  for (const path of ['', '/root', '../secret', 'a/../b', 'a//b', 'C:/secret', 'a\\b', 'a\0b']) {
    await assert.rejects(new Response(createZipStream([{ path, data: utf8('x') }])).arrayBuffer(), /Unsafe ZIP path/)
  }
  await assert.rejects(new Response(createZipStream([
    { path: 'same', data: utf8('1') },
    { path: 'same', data: utf8('2') },
  ])).arrayBuffer(), /Duplicate ZIP path/)
})
