import 'server-only'
import { checkOrigin } from './admin-auth'
import { fail, jsonBody, success, uuid } from './admin-api-types'
import { db } from './supabase'
import { MAX_BULK_MOVE } from './bulk-move-types'

const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/

export async function bulkMove(request: Request) {
  if (!checkOrigin(request)) return fail('この操作は許可されていません。', 403)
  const body = await jsonBody(request)
  if (!body || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > MAX_BULK_MOVE ||
      !['member', 'location'].includes(String(body.toType)) ||
      typeof body.toId !== 'string' || !uuid.test(body.toId) ||
      typeof body.actorId !== 'string' || !uuid.test(body.actorId) ||
      (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 500)))
    return fail('備品・移動先・変更者を確認してください。一度に移動できるのは100件までです。', 400)
  const ids = new Set<string>()
  const items: { id: string; expected_updated_at: string }[] = []
  for (const item of body.items) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !uuid.test(item.id) ||
        typeof item.expectedUpdatedAt !== 'string' || !timestamp.test(item.expectedUpdatedAt) ||
        !Number.isFinite(Date.parse(item.expectedUpdatedAt)) || ids.has(item.id.toLowerCase()))
      return fail('選択した備品を確認してください。', 400)
    ids.add(item.id.toLowerCase())
    items.push({ id: item.id, expected_updated_at: item.expectedUpdatedAt })
  }
  try {
    const { data, error } = await db().rpc('move_equipments', {
      p_items: items, p_to_type: body.toType, p_to_id: body.toId,
      p_changed_by_member_id: body.actorId, p_note: body.note || null,
    })
    if (error) {
      if (error.message.includes('equipment_changed'))
        return fail('別の人が先に変更した備品があります。全件の移動を取り消しました。一覧を更新して選び直してください。', 409)
      if (error.message.includes('equipment_not_found'))
        return fail('削除された備品があります。全件の移動を取り消しました。一覧を更新して選び直してください。', 409)
      if (error.message.includes('invalid_'))
        return fail('備品・部員・保管場所を確認してください。現在位置は変更されていません。', 400)
      throw error
    }
    return success(data)
  } catch (error) {
    console.error('Bulk movement failed', error)
    return fail('保存結果を確認できませんでした。一覧を更新し、現在位置と履歴を確認してください。', 500)
  }
}
