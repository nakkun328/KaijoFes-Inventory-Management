import { NextResponse } from 'next/server'
import { adminScopedClient, checkOrigin, hasAdminAccess, publicAuthClient, saveAdminSession } from '@/lib/admin-auth'
import { fail, jsonBody } from '@/lib/admin-api-types'

export async function POST(request: Request) {
  if (!checkOrigin(request)) return fail('この操作は許可されていません。', 403)
  const body = await jsonBody(request)
  if (!body || typeof body.email !== 'string' || typeof body.password !== 'string' ||
      body.email.length > 320 || body.password.length > 1024) return fail('メールアドレスとパスワードを確認してください。', 400)
  try {
    const { data, error } = await publicAuthClient().auth.signInWithPassword({
      email: body.email.trim(), password: body.password,
    })
    if (error || !data.user || !data.session) return fail('認証できませんでした。', 401)
    if (!await hasAdminAccess(adminScopedClient(data.session.access_token), data.user.id))
      return fail('管理者として登録されていません。', 403)
    await saveAdminSession(data.session.access_token, data.session.refresh_token, data.session.expires_in)
    return NextResponse.json({ user: { id: data.user.id, email: data.user.email } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Admin login failed', error)
    return fail('認証できませんでした。', 500)
  }
}
