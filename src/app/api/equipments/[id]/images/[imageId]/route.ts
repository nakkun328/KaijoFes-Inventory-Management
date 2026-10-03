import { db } from '@/lib/supabase'
import { photoResponse } from '@/lib/photo-response'

export const dynamic = 'force-dynamic'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const bucket = 'equipment-photos'

export async function GET(request: Request, context: { params: Promise<{ id: string; imageId: string }> }) {
  const { id, imageId } = await context.params
  if (!uuid.test(id) || !uuid.test(imageId)) return new Response(null, { status: 404 })
  try {
    const client = db()
    const image = await client.from('equipment_images').select('storage_path,equipment:equipments!inner(id)')
      .eq('id', imageId).eq('equipment_id', id).is('equipment.deleted_at', null).maybeSingle()
    if (image.error) throw image.error
    if (!image.data) return new Response(null, { status: 404 })
    const storagePath = image.data.storage_path
    return await photoResponse(request, storagePath, async () => {
      const download = await client.storage.from(bucket).download(storagePath)
      if (download.error || !download.data) throw download.error ?? new Error('Image is unavailable')
      return download.data
    })
  } catch (error) {
    console.error('Equipment image read failed', error)
    return new Response(null, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
