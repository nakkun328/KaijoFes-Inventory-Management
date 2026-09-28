import { fail, jsonBody, requiredName, success, uuid, withAdmin } from '@/lib/admin-api-types'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return withAdmin(request, true, async ({ client }) => {
    const { id } = await context.params
    const body = await jsonBody(request)
    if (!uuid.test(id) || !body || !Object.keys(body).length ||
        Object.keys(body).some((key) => !['name', 'active'].includes(key)) ||
        (body.name !== undefined && !requiredName(body.name)) ||
        (body.active !== undefined && typeof body.active !== 'boolean'))
      return fail('入力内容を確認してください。', 400)
    const { data, error } = await client.from('members').update({
      ...body, ...(body.name ? { name: (body.name as string).trim() } : {}), updated_at: new Date().toISOString(),
    }).eq('id', id).select('id,name,active,created_at,updated_at').maybeSingle()
    if (error) throw error
    return data ? success({ item: data }) : fail('部員が見つかりません。', 404)
  })
}
