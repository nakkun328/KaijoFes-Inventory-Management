import { fail, jsonBody, requiredName, success, withAdmin } from '@/lib/admin-api-types'

export async function GET(request: Request) {
  return withAdmin(request, false, async ({ client }) => {
    const { data, error } = await client.from('categories').select('id,name,sort_order,created_at,updated_at')
      .order('sort_order').order('name')
    if (error) throw error
    return success({ items: data || [] })
  })
}

export async function POST(request: Request) {
  return withAdmin(request, true, async ({ client }) => {
    const body = await jsonBody(request)
    if (!body || !requiredName(body.name) ||
        (body.sort_order !== undefined && (!Number.isInteger(body.sort_order) || Math.abs(body.sort_order as number) > 100000)))
      return fail('入力内容を確認してください。', 400)
    const { data, error } = await client.from('categories').insert({ name: body.name.trim(), sort_order: body.sort_order ?? 0 })
      .select('id,name,sort_order,created_at,updated_at').single()
    if (error) {
      if (error.code === '23505') return fail('同じカテゴリ名が登録されています。', 409)
      throw error
    }
    return success({ item: data }, 201)
  })
}
