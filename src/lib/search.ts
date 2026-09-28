import type { Equipment } from './types'

export function searchEquipments(equipments: Equipment[], search: string): Equipment[] {
  const query = search.trim().toLocaleLowerCase('ja-JP')
  if (!query) return equipments
  return equipments.filter((item) => [
    item.name,
    item.management_number,
    item.category.name,
    item.holder.name,
    item.default_location?.name,
    item.description,
  ].some((field) => field?.toLocaleLowerCase('ja-JP').includes(query)))
}
