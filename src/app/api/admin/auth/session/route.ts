import { getAdminContext } from '@/lib/admin-auth'
import { fail, success } from '@/lib/admin-api-types'

export async function GET() {
  try {
    const context = await getAdminContext()
    if (!context) return fail('管理者ログインが必要です。', 401)
    return success({ user: { id: context.user.id, email: context.user.email } })
  } catch (error) {
    console.error('Admin session failed', error)
    return fail('認証状態を確認できませんでした。', 500)
  }
}
