import { success, withAdmin } from '@/lib/admin-api-types'

export async function GET(request: Request) {
  return withAdmin(request, false, async ({ client }) => {
    const [categories, locations, members] = await Promise.all([
      client.from('categories').select('id,name,sort_order').order('sort_order').order('name'),
      client.from('locations').select('id,name,description,active').order('name'),
      client.from('members').select('id,name,active').order('name'),
    ])
    for (const result of [categories, locations, members]) if (result.error) throw result.error
    return success({ categories: categories.data ?? [], locations: locations.data ?? [], members: members.data ?? [] })
  })
}
