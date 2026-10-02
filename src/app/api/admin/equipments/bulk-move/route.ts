import { withAdmin } from '@/lib/admin-api-types'
import { bulkMove } from '@/lib/bulk-move'

export async function POST(request: Request) {
  return withAdmin(request, true, async () => bulkMove(request))
}
