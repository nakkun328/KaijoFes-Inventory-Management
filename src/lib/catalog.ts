import 'server-only'
import { db } from './supabase'
import type { Catalog, Equipment, Movement, Named } from './types'

function named(value: unknown): Named | null {
  if (!value || typeof value !== 'object' || !('id' in value) || !('name' in value)) return null
  return { id: String(value.id), name: String(value.name) }
}

const equipmentSelect = `id, management_number, name, description, status, updated_at,
  category:categories(id,name), default_location:locations!equipments_default_location_id_fkey(id,name),
  current_member:members!equipments_current_member_id_fkey(id,name),
  current_location:locations!equipments_current_location_id_fkey(id,name),
  components:equipment_components(id,name,quantity,note,sort_order),
  images:equipment_images(id,sort_order,is_primary)`

function mapEquipment(row: Record<string, unknown>): Equipment {
  const member = named(row.current_member)
  const location = named(row.current_location)
  const category = named(row.category)
  if (!category || (!member && !location)) throw new Error('Invalid equipment data')
  const components = Array.isArray(row.components)
    ? row.components as (Equipment['components'][number] & { sort_order: number })[] : []
  const equipmentId = String(row.id)
  const images = Array.isArray(row.images)
    ? row.images as { id: string; sort_order: number; is_primary: boolean }[] : []
  return {
    id: equipmentId, management_number: String(row.management_number), name: String(row.name),
    description: typeof row.description === 'string' ? row.description : null,
    status: row.status as Equipment['status'], updated_at: String(row.updated_at),
    category, default_location: named(row.default_location),
    holder: member ? { ...member, type: 'member' } : { ...location!, type: 'location' },
    components: components.sort((a, b) => a.sort_order - b.sort_order),
    images: images.sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
      .map((image) => ({ ...image, url: `/api/equipments/${equipmentId}/images/${image.id}` })),
  }
}

export async function getCatalog(): Promise<Catalog> {
  const client = db()
  const [members, locations, categories, equipments] = await Promise.all([
    client.from('members').select('id,name').eq('active', true).order('name'),
    client.from('locations').select('id,name').eq('active', true).order('name'),
    client.from('categories').select('id,name').order('sort_order').order('name'),
    client.from('equipments').select(equipmentSelect).is('deleted_at', null).order('name'),
  ])
  for (const result of [members, locations, categories, equipments]) if (result.error) throw result.error
  return {
    members: members.data as Named[], locations: locations.data as Named[],
    categories: categories.data as Named[],
    equipments: (equipments.data || []).map((row) => mapEquipment(row as unknown as Record<string, unknown>)),
  }
}

export async function getEquipment(id: string): Promise<{ equipment: Equipment; latest: Movement | null } | null> {
  const client = db()
  const result = await client.from('equipments').select(equipmentSelect).eq('id', id).is('deleted_at', null).maybeSingle()
  if (result.error) throw result.error
  if (!result.data) return null
  const latest = await client.from('movement_history')
    .select('id,from_name_snapshot,to_name_snapshot,changed_by_name_snapshot,note,created_at')
    .eq('equipment_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (latest.error) throw latest.error
  return { equipment: mapEquipment(result.data as unknown as Record<string, unknown>), latest: latest.data as Movement | null }
}
