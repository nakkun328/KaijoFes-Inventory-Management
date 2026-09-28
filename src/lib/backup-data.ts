import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export const BACKUP_TABLES = [
  'categories', 'locations', 'members', 'equipments',
  'equipment_components', 'equipment_images', 'movement_history',
] as const
export type BackupTable = (typeof BACKUP_TABLES)[number]
export type BackupRow = Record<string, unknown> & { id: string }

const pageSize = 500

/** Read all rows in stable UUID order without the PostgREST 1000-row cap. */
export async function* backupRows(client: SupabaseClient, table: BackupTable): AsyncGenerator<BackupRow> {
  let after: string | null = null
  while (true) {
    let query = client.from(table).select('*').order('id', { ascending: true }).limit(pageSize)
    if (after) query = query.gt('id', after)
    const { data, error } = await query
    if (error) throw new Error(`Backup could not read ${table}: ${error.message}`)
    const rows = (data ?? []) as BackupRow[]
    for (const row of rows) {
      if (typeof row.id !== 'string') throw new Error(`Backup ${table} row has no UUID`)
      yield row
    }
    if (rows.length < pageSize) return
    after = rows[rows.length - 1].id
  }
}

const utf8 = new TextEncoder()

/** Write a JSON array incrementally; count is filled when the entry finishes. */
export async function* jsonTable(
  client: SupabaseClient, table: BackupTable, counts: Partial<Record<BackupTable, number>>,
  onRow?: (row: BackupRow) => void,
): AsyncGenerator<Uint8Array> {
  yield utf8.encode('[\n')
  let count = 0
  for await (const row of backupRows(client, table)) {
    if (count) yield utf8.encode(',\n')
    yield utf8.encode(JSON.stringify(row))
    onRow?.(row)
    count++
  }
  yield utf8.encode('\n]\n')
  counts[table] = count
}

const equipmentColumns = [
  'id', 'management_number', 'name', 'category_id', 'description',
  'default_location_id', 'current_member_id', 'current_location_id',
  'status', 'created_at', 'updated_at', 'deleted_at', 'deleted_by',
]

function csvField(value: unknown) {
  const raw = value === null || value === undefined ? '' : String(value)
  // The JSON is lossless. Prefix spreadsheet formulas in the convenience CSV.
  const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}

export async function* equipmentsCsv(client: SupabaseClient): AsyncGenerator<Uint8Array> {
  yield utf8.encode(`\uFEFF${equipmentColumns.map(csvField).join(',')}\r\n`)
  for await (const row of backupRows(client, 'equipments')) {
    yield utf8.encode(`${equipmentColumns.map((column) => csvField(row[column])).join(',')}\r\n`)
  }
}

export function safePhotoPath(path: unknown): path is string {
  return typeof path === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/i.test(path)
}
