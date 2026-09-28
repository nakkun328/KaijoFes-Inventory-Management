import { fail, success, uuid, withAdmin } from '@/lib/admin-api-types'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withAdmin(request, true, async ({ client }) => {
    const { id } = await context.params
    if (!uuid.test(id)) return fail('備品が見つかりません。', 404)
    const { data, error } = await client.from('equipments').update({ deleted_at: null, deleted_by: null })
      .eq('id', id).not('deleted_at', 'is', null).select('id').maybeSingle()
    if (error) throw error
    return data ? success({ ok: true }) : fail('備品が見つかりません。', 404)
  })
}
