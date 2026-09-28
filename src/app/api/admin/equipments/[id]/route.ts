import { fail, jsonBody, optionalText, optionalUuid, requiredName, success, uuid, withAdmin } from '@/lib/admin-api-types'

type Context = { params: Promise<{ id: string }> }
const fields = 'id,management_number,name,category_id,description,default_location_id,current_member_id,current_location_id,status,created_at,updated_at,deleted_at,deleted_by,category:categories(id,name),default_location:locations!equipments_default_location_id_fkey(id,name),current_member:members!equipments_current_member_id_fkey(id,name),current_location:locations!equipments_current_location_id_fkey(id,name)'

export async function GET(request: Request, context: Context) {
  return withAdmin(request, false, async ({ client }) => {
    const { id } = await context.params
    if (!uuid.test(id)) return fail('備品が見つかりません。', 404)
    const { data, error } = await client.from('equipments').select(fields).eq('id', id).maybeSingle()
    if (error) throw error
    return data ? success({ item: data }) : fail('備品が見つかりません。', 404)
  })
}

export async function PATCH(request: Request, context: Context) {
  return withAdmin(request, true, async ({ client }) => {
    const { id } = await context.params
    const body = await jsonBody(request)
    if (!uuid.test(id) || !body) return fail('入力内容を確認してください。', 400)
    const allowed = new Set(['name', 'category_id', 'description', 'default_location_id', 'status'])
    if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.has(key)) ||
        (body.name !== undefined && !requiredName(body.name)) ||
        (body.category_id !== undefined && (typeof body.category_id !== 'string' || !uuid.test(body.category_id))) ||
        !optionalText(body.description) || !optionalUuid(body.default_location_id) ||
        (body.status !== undefined && !['broken', 'lost', 'stored', 'borrowed'].includes(String(body.status))))
      return fail('入力内容を確認してください。', 400)
    const { data: current, error: currentError } = await client.from('equipments').select('current_member_id,current_location_id,deleted_at').eq('id', id).maybeSingle()
    if (currentError) throw currentError
    if (!current || current.deleted_at) return fail('備品が見つかりません。', 404)
    if ((body.status === 'stored' && !current.current_location_id) || (body.status === 'borrowed' && !current.current_member_id))
      return fail('状態と現在地を確認してください。', 400)
    const patch = { ...body, ...(body.name ? { name: (body.name as string).trim() } : {}), updated_at: new Date().toISOString() }
    const { data, error } = await client.from('equipments').update(patch).eq('id', id).is('deleted_at', null).select(fields).maybeSingle()
    if (error) {
      if (error.code === '23503' || error.code === '23514') return fail('カテゴリ・保管場所または状態を確認してください。', 400)
      throw error
    }
    return data ? success({ item: data }) : fail('備品が見つかりません。', 404)
  })
}

export async function DELETE(request: Request, context: Context) {
  return withAdmin(request, true, async ({ client, user }) => {
    const { id } = await context.params
    if (!uuid.test(id)) return fail('備品が見つかりません。', 404)
    const { data, error } = await client.from('equipments').update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq('id', id).is('deleted_at', null).select('id').maybeSingle()
    if (error) throw error
    return data ? success({ ok: true }) : fail('備品が見つかりません。', 404)
  })
}
