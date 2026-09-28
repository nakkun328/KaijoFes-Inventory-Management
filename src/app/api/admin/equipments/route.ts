import { fail, jsonBody, optionalText, optionalUuid, pageParams, requiredName, safeSearch, success, uuid, withAdmin } from '@/lib/admin-api-types'

const fields = 'id,management_number,name,category_id,description,default_location_id,current_member_id,current_location_id,status,created_at,updated_at,deleted_at,deleted_by,category:categories(id,name),default_location:locations!equipments_default_location_id_fkey(id,name),current_member:members!equipments_current_member_id_fkey(id,name),current_location:locations!equipments_current_location_id_fkey(id,name)'

export async function GET(request: Request) {
  return withAdmin(request, false, async ({ client }) => {
    const url = new URL(request.url)
    const { page, pageSize, from, to } = pageParams(url)
    const deleted = url.searchParams.get('deleted') || 'active'
    if (!['active', 'deleted', 'all'].includes(deleted)) return fail('検索条件を確認してください。', 400)
    let query = client.from('equipments').select(fields, { count: 'exact' })
    if (deleted === 'active') query = query.is('deleted_at', null)
    if (deleted === 'deleted') query = query.not('deleted_at', 'is', null)
    const categoryId = url.searchParams.get('categoryId')
    if (categoryId) {
      if (!uuid.test(categoryId)) return fail('検索条件を確認してください。', 400)
      query = query.eq('category_id', categoryId)
    }
    const status = url.searchParams.get('status')
    if (status) {
      if (!['stored', 'borrowed', 'broken', 'lost'].includes(status)) return fail('検索条件を確認してください。', 400)
      query = query.eq('status', status)
    }
    const q = safeSearch(url.searchParams.get('q'))
    if (q) query = query.or(`name.ilike.%${q}%,management_number.ilike.%${q}%,description.ilike.%${q}%`)
    const { data, error, count } = await query.order('updated_at', { ascending: false }).range(from, to)
    if (error) throw error
    return success({ items: data || [], total: count || 0, page, pageSize })
  })
}

export async function POST(request: Request) {
  return withAdmin(request, true, async ({ client }) => {
    const body = await jsonBody(request)
    if (!body || !requiredName(body.name) || typeof body.category_id !== 'string' || !uuid.test(body.category_id) ||
        !optionalText(body.description) || !optionalUuid(body.default_location_id) ||
        !optionalUuid(body.current_member_id) || !optionalUuid(body.current_location_id) ||
        Boolean(body.current_member_id) === Boolean(body.current_location_id)) return fail('入力内容を確認してください。', 400)
    const status = body.status ?? (body.current_member_id ? 'borrowed' : 'stored')
    if (!['stored', 'borrowed', 'broken', 'lost'].includes(String(status)) ||
        (status === 'stored' && !body.current_location_id) || (status === 'borrowed' && !body.current_member_id))
      return fail('状態と現在地を確認してください。', 400)
    const { data, error } = await client.from('equipments').insert({
      name: body.name.trim(), category_id: body.category_id,
      description: body.description ?? null, default_location_id: body.default_location_id ?? null,
      current_member_id: body.current_member_id ?? null, current_location_id: body.current_location_id ?? null,
      status,
    }).select(fields).single()
    if (error) {
      if (error.code === '23503' || error.code === '23514') return fail('カテゴリ・保管場所・部員または状態を確認してください。', 400)
      throw error
    }
    return success({ item: data }, 201)
  })
}
