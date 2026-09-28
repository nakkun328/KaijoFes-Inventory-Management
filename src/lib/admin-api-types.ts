import { NextResponse } from 'next/server'
import { checkOrigin, getAdminContext, type AdminContext } from './admin-auth'

export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function success<T>(payload: T, status = 200) {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return null
  if (Number(request.headers.get('content-length') || 0) > 32768) return null
  try {
    if (!request.body) return null
    const reader = request.body.getReader()
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 32768) { await reader.cancel(); return null }
      chunks.push(value)
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch { return null }
}

export function optionalText(value: unknown, max = 5000): value is string | null | undefined {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= max)
}

export function requiredName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200
}

export function optionalUuid(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || (typeof value === 'string' && uuid.test(value))
}

export function pageParams(url: URL) {
  const page = Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1))
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get('pageSize') || '20', 10) || 20))
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 }
}

export function safeSearch(value: string | null) {
  return value?.trim().slice(0, 200).replace(/[,%()]/g, ' ') || ''
}

export async function withAdmin(request: Request, mutation: boolean, work: (context: AdminContext) => Promise<Response>) {
  if (mutation && !checkOrigin(request)) return fail('この操作は許可されていません。', 403)
  try {
    const context = await getAdminContext()
    if (!context) return fail('管理者ログインが必要です。', 401)
    return await work(context)
  } catch (error) {
    console.error('Admin API failed', error)
    return fail('処理を完了できませんでした。', 500)
  }
}
