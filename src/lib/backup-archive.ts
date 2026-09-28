import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import packageJson from '../../package.json'
import { BACKUP_FORMAT_VERSION, SCHEMA_VERSION } from './backup-version'
import { BACKUP_TABLES, equipmentsCsv, jsonTable, safePhotoPath, type BackupTable } from './backup-data'
import type { ZipEntry } from './zip-stream'

const bucket = 'equipment-photos'
const encoder = new TextEncoder()

export async function* backupEntries(client: SupabaseClient, startedAt: string): AsyncGenerator<ZipEntry> {
  const counts: Partial<Record<BackupTable, number>> = {}
  const photoPaths: string[] = []
  for (const table of BACKUP_TABLES) {
    yield {
      path: `${table}.json`,
      data: jsonTable(client, table, counts, table === 'equipment_images' ? (row) => {
        if (!safePhotoPath(row.storage_path)) throw new Error('Backup found an unsafe photo path')
        photoPaths.push(row.storage_path)
      } : undefined),
    }
  }
  yield { path: 'equipments.csv', data: equipmentsCsv(client) }

  for (const path of photoPaths) {
    const { data, error } = await client.storage.from(bucket).download(path)
    if (error || !data) throw new Error(`Backup could not read photo ${path}: ${error?.message ?? 'missing file'}`)
    yield { path: `photos/${path}`, data: data.stream() }
  }

  const metadata = {
    archive_format: 'kaijofes-inventory-backup',
    backup_format_version: BACKUP_FORMAT_VERSION,
    schema_version: SCHEMA_VERSION,
    app_version: packageJson.version,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    table_counts: counts,
    photo_count: photoPaths.length,
    photo_directory: 'photos/',
    storage_bucket: bucket,
    consistency: 'sequential_read',
    contains_soft_deleted_equipments: true,
  }
  yield { path: 'metadata.json', data: encoder.encode(`${JSON.stringify(metadata, null, 2)}\n`) }
}
