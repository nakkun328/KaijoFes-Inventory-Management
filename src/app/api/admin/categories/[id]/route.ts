import { fail, jsonBody, requiredName, success, uuid, withAdmin } from '@/lib/admin-api-types'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return withAdmin(request, true, async ({ client }) => {
    const { id } = await context.params
    const body = await jsonBody(request)
    if (!uuid.test(id) || !body || !Object.keys(body).length ||
        Object.keys(body).some((key) => !['name', 'sort_order'].includes(key)) ||
        (body.name !== undefined && !requiredName(body.name)) ||
        (body.sort_order !== undefined && (!Number.isInteger(body.sort_order) || Math.abs(body.sort_order as number) > 100000)))
      return fail('入力内容を確認してください。', 400)
    const { data, error } = await client.from('categories').update({
      ...body, ...(body.name ? { name: (body.name as string).trim() } : {}), updated_at: new Date().toISOString(),
    }).eq('id', id).select('id,name,sort_order,created_at,updated_at').maybeSingle()
    if (error) {
      if (error.code === '23505') return fail('同じカテゴリ名が登録されています。', 409)
      throw error
    }
    return data ? success({ item: data }) : fail('カテゴリが見つかりません。', 404)
  })
}
