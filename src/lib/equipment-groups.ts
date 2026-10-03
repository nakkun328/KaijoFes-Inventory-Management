import type { Equipment, Named } from './types'

export type EquipmentView = 'all' | 'category' | 'location' | 'member'

export function groupEquipments(items: Equipment[], view: EquipmentView, categories: Named[]) {
  if (view === 'all') return [['すべて', [...items].sort((a, b) =>
    (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0))]] as [string, Equipment[]][]
  if (view === 'category') {
    // Catalog categories arrive in the administrator's sort_order, then name order.
    // Use IDs so grouping remains correct even when names are changed.
    const grouped = new Map<string, Equipment[]>()
    for (const item of items) {
      const group = grouped.get(item.category.id) ?? []
      group.push(item)
      grouped.set(item.category.id, group)
    }
    const result: [string, Equipment[]][] = []
    for (const category of categories) {
      const group = grouped.get(category.id)
      if (group) { result.push([category.name, group]); grouped.delete(category.id) }
    }
    for (const group of grouped.values()) result.push([group[0].category.name, group])
    return result
  }
  const grouped = new Map<string, Equipment[]>()
  for (const item of items) {
    const key = view === 'member'
      ? item.holder.type === 'member' ? item.holder.name : '保管場所にある備品'
      : item.holder.type === 'location' ? item.holder.name : '部員が所持中'
    const group = grouped.get(key) ?? []
    group.push(item)
    grouped.set(key, group)
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, 'ja'))
}
