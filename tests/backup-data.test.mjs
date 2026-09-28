import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = (await readFile(new URL('../src/lib/backup-data.ts', import.meta.url), 'utf8'))
  .replace("import 'server-only'", '')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { backupRows, jsonTable, equipmentsCsv } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

function fakeClient(items) {
  const requests = []
  return {
    requests,
    from(table) {
      const query = { table, after: null, limitSize: 0,
        select() { return this },
        order() { return this },
        limit(value) { this.limitSize = value; return this },
        gt(_column, value) { this.after = value; return this },
        then(resolve) {
          requests.push({ table: this.table, after: this.after, limit: this.limitSize })
          const data = items.filter((item) => !this.after || item.id > this.after)
            .slice(0, this.limitSize)
          resolve({ data, error: null })
        },
      }
      return query
    },
  }
}

async function bytesToText(source) {
  let value = ''
  for await (const bytes of source) value += new TextDecoder().decode(bytes)
  return value
}

test('backup reads beyond the 1000-row API cap without truncation', async () => {
  const items = Array.from({ length: 1201 }, (_, index) => ({
    id: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
    name: `equipment ${index}`,
  }))
  const client = fakeClient(items)
  const actual = []
  for await (const row of backupRows(client, 'equipments')) actual.push(row)
  assert.deepEqual(actual, items)
  assert.deepEqual(client.requests.map((request) => request.after),
    [null, items[499].id, items[999].id])
})

test('JSON preserves fields while convenience CSV quotes text and neutralizes formulas', async () => {
  const item = { id: '00000000-0000-0000-0000-000000000001',
    management_number: 'EQ-000001', name: '=SUM(1,2)', description: 'photo, "front"',
    deleted_at: '2026-09-28T00:00:00Z' }
  const counts = {}
  assert.deepEqual(JSON.parse(await bytesToText(jsonTable(fakeClient([item]), 'equipments', counts))), [item])
  assert.equal(counts.equipments, 1)
  const csv = await bytesToText(equipmentsCsv(fakeClient([item])))
  assert(csv.includes('"\'=SUM(1,2)"'))
  assert(csv.includes('"photo, ""front"""'))
  assert(csv.includes(item.deleted_at))
})
