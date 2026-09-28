import type { Equipment, Status } from './types'

export const statusLabel: Record<Status, string> = {
  stored: '保管中', borrowed: '貸出中', broken: '故障中', lost: '紛失',
}
export function holderLabel(equipment: Equipment) {
  return equipment.holder.type === 'member'
    ? `${equipment.holder.name}が所持中` : equipment.holder.name
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}
