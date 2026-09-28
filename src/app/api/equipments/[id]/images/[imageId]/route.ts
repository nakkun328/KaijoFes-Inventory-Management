import { db } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const mimeTypes: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
}
const bucket = 'equipment-photos'

export async function GET(_request: Request, context: { params: Promise<{ id: string; imageId: string }> }) {
  const { id, imageId } = await context.params
  if (!uuid.test(id) || !uuid.test(imageId)) return new Response(null, { status: 404 })
  try {
    const client = db()
    const equipment = await client.from('equipments').select('id').eq('id', id).is('deleted_at', null).maybeSingle()
    if (equipment.error) throw equipment.error
    if (!equipment.data) return new Response(null, { status: 404 })
    const image = await client.from('equipment_images').select('storage_path')
      .eq('id', imageId).eq('equipment_id', id).maybeSingle()
    if (image.error) throw image.error
    if (!image.data) return new Response(null, { status: 404 })
    const extension = image.data.storage_path.split('.').pop()?.toLowerCase() ?? ''
    const contentType = mimeTypes[extension]
    if (!contentType) return new Response(null, { status: 404 })
    const download = await client.storage.from(bucket).download(image.data.storage_path)
    if (download.error || !download.data) throw download.error ?? new Error('Image is unavailable')
    return new Response(download.data, { headers: {
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    } })
  } catch (error) {
    console.error('Equipment image read failed', error)
    return new Response(null, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
