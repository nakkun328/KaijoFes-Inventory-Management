import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

test('backup schema version identifies the newest migration', async () => {
  const source = await readFile(new URL('../src/lib/backup-version.ts', import.meta.url), 'utf8')
  const version = source.match(/SCHEMA_VERSION = '(\d+)'/)?.[1]
  assert(version)
  const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
    .filter((name) => /^\d+_.*\.sql$/.test(name)).sort()
  assert.equal(version, migrations.at(-1).split('_', 1)[0])
})
