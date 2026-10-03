export type AdminCategory = { id: string; name: string; sort_order: number }
export type AdminLocation = { id: string; name: string; description: string | null; active: boolean }
export type AdminMember = { id: string; name: string; active: boolean }
export type ReferenceLists = { categories: AdminCategory[]; locations: AdminLocation[]; members: AdminMember[] }
export type AdminEquipment = {
  id: string; management_number: string; name: string; description: string | null;
  category_id: string; default_location_id: string | null; current_member_id: string | null;
  current_location_id: string | null; status: 'stored' | 'borrowed' | 'broken' | 'lost';
  updated_at: string; deleted_at: string | null; category?: { id: string; name: string } | null;
  default_location?: { id: string; name: string } | null; current_member?: { id: string; name: string } | null; current_location?: { id: string; name: string } | null;
}
export type AdminHistory = {
  id: string; equipment_id: string; equipment_name?: string; management_number?: string;
  from_type: string; from_name_snapshot: string; to_type: string; to_name_snapshot: string;
  changed_by_name_snapshot: string; note: string | null; created_at: string;
  equipment?: { name: string; management_number: string } | null;
}
export type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number }

export class AdminHttpError extends Error { constructor(message: string, public status: number) { super(message) } }

export async function adminRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init,
    headers: { ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } })
  const data: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error : `通信に失敗しました（${response.status}）`
    throw new AdminHttpError(message, response.status)
  }
  return data as T
}
export const jsonBody = (value: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(value) })
export function displayDate(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : '処理に失敗しました。' }
export const statusNames = { stored: '保管中', borrowed: '貸出中', broken: '故障中', lost: '紛失' } as const
