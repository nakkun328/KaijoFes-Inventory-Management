import 'server-only'
import { cookies } from 'next/headers'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

const accessCookie = 'kaijofes_admin_access'
const refreshCookie = 'kaijofes_admin_refresh'

function config() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('Supabase environment variables are missing')
  return { url, key }
}

export function publicAuthClient() {
  const { url, key } = config()
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function adminScopedClient(accessToken: string) {
  const { url, key } = config()
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

export async function saveAdminSession(accessToken: string, refreshToken: string, expiresIn: number) {
  const jar = await cookies()
  jar.set(accessCookie, accessToken, { ...cookieOptions, maxAge: Math.max(1, expiresIn) })
  jar.set(refreshCookie, refreshToken, { ...cookieOptions, maxAge: 60 * 60 * 24 * 30 })
}

export async function clearAdminSession() {
  const jar = await cookies()
  jar.set(accessCookie, '', { ...cookieOptions, maxAge: 0 })
  jar.set(refreshCookie, '', { ...cookieOptions, maxAge: 0 })
}

export async function hasAdminAccess(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data?.user_id === userId
}

export type AdminContext = { client: SupabaseClient; user: User }

export async function getAdminContext(): Promise<AdminContext | null> {
  const jar = await cookies()
  let accessToken = jar.get(accessCookie)?.value
  const auth = publicAuthClient()
  let userData: Awaited<ReturnType<typeof auth.auth.getUser>>['data'] = { user: null }
  let error: Error | null = null
  if (accessToken) ({ data: userData, error } = await auth.auth.getUser(accessToken))
  if (error || !userData.user) {
    const refreshToken = jar.get(refreshCookie)?.value
    if (!refreshToken) return null
    const refreshed = await auth.auth.refreshSession({ refresh_token: refreshToken })
    if (refreshed.error || !refreshed.data.session) return null
    accessToken = refreshed.data.session.access_token
    await saveAdminSession(accessToken, refreshed.data.session.refresh_token, refreshed.data.session.expires_in)
    ;({ data: userData, error } = await auth.auth.getUser(accessToken))
    if (error || !userData.user) return null
  }
  if (!accessToken) return null
  const client = adminScopedClient(accessToken)
  if (!await hasAdminAccess(client, userData.user.id)) return null
  return { client, user: userData.user }
}

export function checkOrigin(request: Request) {
  const site = request.headers.get('sec-fetch-site')
  if (site === 'cross-site') return false
  const origin = request.headers.get('origin')
  if (!origin) return true
  try { return new URL(origin).origin === new URL(request.url).origin }
  catch { return false }
}
