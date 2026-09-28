import { NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import type { HolderType } from '@/lib/types'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
const maxBodyBytes = 4096

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return null
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBodyBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown
  return body !== null && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  let sameOrigin = fetchSite !== 'cross-site'
  try { if (origin) sameOrigin = sameOrigin && new URL(origin).origin === new URL(request.url).origin }
  catch { sameOrigin = false }
  if (!sameOrigin) {
    return NextResponse.json({ error: 'この操作は許可されていません。' }, { status: 403 })
  }
  let body: Record<string, unknown> | null
  try { body = await readBody(request) } catch { body = null }
  if (!body) {
    return NextResponse.json({ error: '入力内容を確認してください。' }, { status: 400 })
  }
  const toType = body.toType as HolderType
  if (!uuid.test(id) || !['member', 'location'].includes(toType) ||
      typeof body.toId !== 'string' || !uuid.test(body.toId) ||
      typeof body.actorId !== 'string' || !uuid.test(body.actorId) ||
      typeof body.expectedUpdatedAt !== 'string' || !timestamp.test(body.expectedUpdatedAt) ||
      Number.isNaN(Date.parse(body.expectedUpdatedAt)) ||
      (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 500))) {
    return NextResponse.json({ error: '入力内容を確認してください。' }, { status: 400 })
  }
  try {
    const { error } = await db().rpc('move_equipment', {
      p_equipment_id: id, p_to_type: toType, p_to_id: body.toId,
      p_changed_by_member_id: body.actorId, p_expected_updated_at: body.expectedUpdatedAt,
      p_note: body.note || null,
    })
    if (error) {
      if (error.message.includes('equipment_changed'))
        return NextResponse.json({ error: '別の人が先に移動しました。最新の現在位置を確認してください。' }, { status: 409 })
      if (error.message.includes('same_destination'))
        return NextResponse.json({ error: 'すでにその場所にあります。' }, { status: 400 })
      if (error.message.includes('equipment_not_found'))
        return NextResponse.json({ error: '備品が見つかりません。' }, { status: 404 })
      if (error.message.includes('invalid_'))
        return NextResponse.json({ error: '選択した部員・保管場所を確認してください。' }, { status: 400 })
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Movement failed', error)
    return NextResponse.json({ error: '移動を保存できませんでした。現在位置は変更されていません。もう一度お試しください。' }, { status: 500 })
  }
}
