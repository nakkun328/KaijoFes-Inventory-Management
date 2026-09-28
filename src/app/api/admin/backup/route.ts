import { withAdmin } from '@/lib/admin-api-types'
import { backupEntries } from '@/lib/backup-archive'
import { createZipStream } from '@/lib/zip-stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  return withAdmin(request, false, async ({ client }) => {
    const startedAt = new Date().toISOString()
    const stamp = startedAt.replace(/\D/g, '').slice(0, 14)
    const stream = createZipStream(backupEntries(client, startedAt))
    return new Response(stream, { headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="backup-${stamp}.zip"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } })
  })
}
