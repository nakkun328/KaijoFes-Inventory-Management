import { fail, success, uuid, withAdmin } from '@/lib/admin-api-types'
import { PHOTO_BUCKET } from '@/lib/photo-validation'

type Context = { params: Promise<{ id: string; imageId: string }> }

export async function GET(request: Request, context: Context) {
  return withAdmin(request, false, async ({ client }) => {
    const { id, imageId } = await context.params
    if (!uuid.test(id) || !uuid.test(imageId)) return fail('写真が見つかりません。', 404)
    const { data: image, error } = await client.from('equipment_images')
      .select('storage_path').eq('id', imageId).eq('equipment_id', id).maybeSingle()
    if (error) throw error
    if (!image) return fail('写真が見つかりません。', 404)
    const { data: photo, error: downloadError } = await client.storage.from(PHOTO_BUCKET).download(image.storage_path)
    if (downloadError || !photo) {
      console.error('Photo Storage download failed', downloadError)
      return fail('写真を読み込めませんでした。', 502)
    }
    const bytes = await photo.arrayBuffer()
    const extension = image.storage_path.split('.').pop()?.toLowerCase()
    const mime = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg'
    return new Response(bytes, { headers: {
      'Content-Type': mime,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } })
  })
}

export async function DELETE(request: Request, context: Context) {
  return withAdmin(request, true, async ({ client }) => {
    const { id, imageId } = await context.params
    if (!uuid.test(id) || !uuid.test(imageId)) return fail('写真が見つかりません。', 404)
    const { data: path, error } = await client.rpc('delete_equipment_image', {
      p_equipment_id: id, p_image_id: imageId,
    })
    if (error) {
      if (error.code === 'P0001') return fail('写真が見つかりません。', 404)
      throw error
    }
    if (typeof path !== 'string') return fail('写真が見つかりません。', 404)
    const { error: removeError } = await client.storage.from(PHOTO_BUCKET).remove([path])
    if (removeError) {
      console.error('Photo Storage delete failed; orphan path:', path, removeError)
      return fail('写真データを削除できませんでした。管理者に確認してください。', 502)
    }
    return success({ ok: true })
  })
}
