import { fail, pageParams, safeSearch, success, uuid, withAdmin } from '@/lib/admin-api-types'

const datePattern = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  return withAdmin(request, false, async ({ client }) => {
    const url = new URL(request.url)
    const { page, pageSize, from: offset, to: end } = pageParams(url)
    const equipmentId = url.searchParams.get('equipmentId')
    const fromDate = url.searchParams.get('fromDate')
    const toDate = url.searchParams.get('toDate')
    if ((equipmentId && !uuid.test(equipmentId)) ||
        (fromDate && !datePattern.test(fromDate)) || (toDate && !datePattern.test(toDate)))
      return fail('検索条件を確認してください。', 400)
    let query = client.from('movement_history').select(
      'id,equipment_id,from_type,from_id,from_name_snapshot,to_type,to_id,to_name_snapshot,changed_by_member_id,changed_by_name_snapshot,note,created_at,equipment:equipments!inner(id,name,management_number)',
      { count: 'exact' },
    )
    if (equipmentId) query = query.eq('equipment_id', equipmentId)
    const q = safeSearch(url.searchParams.get('q'))
    if (q) query = query.or(`name.ilike.%${q}%,management_number.ilike.%${q}%`, { referencedTable: 'equipment' })
    if (fromDate) query = query.gte('created_at', `${fromDate}T00:00:00+09:00`)
    if (toDate) {
      const next = new Date(`${toDate}T00:00:00+09:00`)
      if (Number.isNaN(next.getTime())) return fail('検索条件を確認してください。', 400)
      next.setUTCDate(next.getUTCDate() + 1)
      query = query.lt('created_at', next.toISOString())
    }
    const from = safeSearch(url.searchParams.get('from'))
    const to = safeSearch(url.searchParams.get('to'))
    const actor = safeSearch(url.searchParams.get('actor'))
    if (from) query = query.ilike('from_name_snapshot', `%${from}%`)
    if (to) query = query.ilike('to_name_snapshot', `%${to}%`)
    if (actor) query = query.ilike('changed_by_name_snapshot', `%${actor}%`)
    const { data, error, count } = await query.order('created_at', { ascending: false }).range(offset, end)
    if (error) throw error
    return success({ items: data || [], total: count || 0, page, pageSize })
  })
}
