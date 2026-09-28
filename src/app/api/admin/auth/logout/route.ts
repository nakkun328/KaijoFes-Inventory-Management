import { checkOrigin, clearAdminSession } from '@/lib/admin-auth'
import { fail, success } from '@/lib/admin-api-types'

export async function POST(request: Request) {
  if (!checkOrigin(request)) return fail('この操作は許可されていません。', 403)
  await clearAdminSession()
  return success({ ok: true })
}
