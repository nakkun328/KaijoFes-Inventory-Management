export const MAX_BULK_MOVE = 100
export type BulkMoveItem = { id: string; name: string; management_number?: string; updated_at: string }
export type BulkMoveResult = { movedCount: number; skippedCount: number }
