import { fail, jsonBody, optionalText, requiredName, success, withAdmin } from '@/lib/admin-api-types'

export async function GET(request: Request) {
  return withAdmin(request, false, async ({ client }) => {
    const { data, error } = await client.from('locations').select('id,name,description,active,created_at,updated_at').order('name')
    if (error) throw error
    return success({ items: data || [] })
  })
}

export async function POST(request: Request) {
  return withAdmin(request, true, async ({ client }) => {
    const body = await jsonBody(request)
    if (!body || !requiredName(body.name) || !optionalText(body.description) ||
        (body.active !== undefined && typeof body.active !== 'boolean'))
      return fail('入力内容を確認してください。', 400)
    const { data, error } = await client.from('locations').insert({
      name: body.name.trim(), description: body.description ?? null, active: body.active ?? true,
    }).select('id,name,description,active,created_at,updated_at').single()
    if (error) {
      if (error.code === '23505') return fail('同じ保管場所名が登録されています。', 409)
      throw error
    }
    return success({ item: data }, 201)
  })
}
