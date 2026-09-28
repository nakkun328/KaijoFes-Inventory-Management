import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const secret = process.env.SUPABASE_SECRET_KEY
assert(secret && !secret.includes('REPLACE_WITH'), 'Set SUPABASE_SECRET_KEY in your local environment')
const root = '.next/static'
const files = []
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (entry.isFile()) files.push(path)
  }
}
await walk(root)
assert(files.length > 0, 'No client bundle found; run npm run build first')
const needle = Buffer.from(secret)
for (const file of files) {
  const contents = await readFile(file)
  assert(!contents.includes(needle), `Secret Key found in client asset: ${file}`)
}
console.log(`PASS Secret Key absent from ${files.length} client assets`)
