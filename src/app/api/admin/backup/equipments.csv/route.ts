import { withAdmin } from '@/lib/admin-api-types'
import { equipmentsCsv } from '@/lib/backup-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  return withAdmin(request, false, async ({ client }) => {
    const iterator = equipmentsCsv(client)
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await iterator.next()
          if (next.done) controller.close()
          else controller.enqueue(next.value)
        } catch (error) { controller.error(error) }
      },
      async cancel() { await iterator.return?.(undefined) },
    })
    return new Response(stream, { headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="equipments.csv"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } })
  })
}
