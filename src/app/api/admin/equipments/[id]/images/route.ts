import { fail, jsonBody, success, uuid, withAdmin } from '@/lib/admin-api-types'
import type { AdminContext } from '@/lib/admin-auth'
import { boundedMultipartForm, identifyPhoto, MAX_PHOTO_BYTES, PHOTO_BUCKET } from '@/lib/photo-validation'

type Context = { params: Promise<{ id: string }> }

async function equipmentRecord(client: AdminContext['client'], id: string) {
  const { data, error } = await client.from('equipments').select('id,deleted_at').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

function imageResult(equipmentId: string, row: { id: string; sort_order: number; is_primary: boolean }) {
  return {
    id: row.id,
    sort_order: row.sort_order,
    is_primary: row.is_primary,
    url: `/api/admin/equipments/${equipmentId}/images/${row.id}`,
  }
}

export async function GET(request: Request, context: Context) {
  return withAdmin(request, false, async ({ client }) => {
    const { id } = await context.params
    if (!uuid.test(id) || !await equipmentRecord(client, id)) return fail('備品が見つかりません。', 404)
    const { data, error } = await client.from('equipment_images')
      .select('id,sort_order,is_primary').eq('equipment_id', id)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
    if (error) throw error
    return success({ items: (data || []).map((row) => imageResult(id, row)) })
  })
}

export async function POST(request: Request, context: Context) {
  return withAdmin(request, true, async ({ client }) => {
    const { id } = await context.params
    if (!uuid.test(id)) return fail('備品が見つかりません。', 404)
    const equipment = await equipmentRecord(client, id)
    if (!equipment) return fail('備品が見つかりません。', 404)
    if (equipment.deleted_at) return fail('削除済み備品には写真を追加できません。', 409)
    const form = await boundedMultipartForm(request)
    const file = form?.get('file')
    if (!file || typeof file === 'string' || file.size === 0 || file.size > MAX_PHOTO_BYTES)
      return fail('4 MB 以下の JPEG・PNG・WebP 画像を選んでください。', 400)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const format = identifyPhoto(bytes)
    if (!format || file.type !== format.mime)
      return fail('JPEG・PNG・WebP 画像を選んでください。', 400)

    const { data: existing, error: existingError } = await client.from('equipment_images')
      .select('id,sort_order').eq('equipment_id', id).order('sort_order', { ascending: false }).limit(1)
    if (existingError) throw existingError
    const path = `${id}/${crypto.randomUUID()}.${format.extension}`
    const { error: uploadError } = await client.storage.from(PHOTO_BUCKET).upload(path, bytes, {
      contentType: format.mime, upsert: false, cacheControl: '3600',
    })
    if (uploadError) {
      console.error('Photo Storage upload failed', uploadError)
      return fail('写真をアップロードできませんでした。', 500)
    }
    const { data, error } = await client.from('equipment_images').insert({
      equipment_id: id, storage_path: path,
      sort_order: existing?.length ? existing[0].sort_order + 1 : 0,
      is_primary: !existing?.length,
    }).select('id,sort_order,is_primary').single()
    if (error) {
      const { error: cleanupError } = await client.storage.from(PHOTO_BUCKET).remove([path])
      if (cleanupError) console.error('Photo Storage rollback failed', cleanupError)
      console.error('Photo metadata insert failed', error)
      return fail('写真を登録できませんでした。', 500)
    }
    return success({ item: imageResult(id, data) }, 201)
  })
}

export async function PATCH(request: Request, context: Context) {
  return withAdmin(request, true, async ({ client }) => {
    const { id } = await context.params
    const body = await jsonBody(request)
    if (!uuid.test(id) || !body || !Array.isArray(body.ordered_ids) ||
        body.ordered_ids.length === 0 || body.ordered_ids.length > 100 ||
        body.ordered_ids.some((value) => typeof value !== 'string' || !uuid.test(value)) ||
        new Set(body.ordered_ids).size !== body.ordered_ids.length ||
        typeof body.primary_id !== 'string' || !uuid.test(body.primary_id) ||
        !body.ordered_ids.includes(body.primary_id) ||
        Object.keys(body).some((key) => !['ordered_ids', 'primary_id'].includes(key)))
      return fail('並び順と代表画像を確認してください。', 400)
    if (!await equipmentRecord(client, id)) return fail('備品が見つかりません。', 404)
    const { error } = await client.rpc('set_equipment_image_order', {
      p_equipment_id: id, p_image_ids: body.ordered_ids, p_primary_id: body.primary_id,
    })
    if (error) {
      if (error.code === 'P0001' || error.code === '23514') return fail('画像一覧が更新されました。再読み込みしてください。', 409)
      throw error
    }
    const { data, error: readError } = await client.from('equipment_images')
      .select('id,sort_order,is_primary').eq('equipment_id', id)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
    if (readError) throw readError
    return success({ items: (data || []).map((row) => imageResult(id, row)) })
  })
}
