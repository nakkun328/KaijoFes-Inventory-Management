export type HolderType = 'member' | 'location'
export type Status = 'stored' | 'borrowed' | 'broken' | 'lost'
export type Named = { id: string; name: string }
export type EquipmentImage = { id: string; url: string; sort_order: number; is_primary: boolean }
export type Equipment = {
  id: string
  management_number: string
  name: string
  description: string | null
  status: Status
  updated_at: string
  category: Named
  default_location: Named | null
  holder: Named & { type: HolderType }
  components: { id: string; name: string; quantity: number; note: string | null }[]
  images: EquipmentImage[]
}
export type Movement = {
  id: string
  from_name_snapshot: string
  to_name_snapshot: string
  changed_by_name_snapshot: string
  note: string | null
  created_at: string
}
export type Catalog = { members: Named[]; locations: Named[]; categories: Named[]; equipments: Equipment[] }
