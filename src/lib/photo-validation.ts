export const PHOTO_BUCKET = 'equipment-photos'
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024
// Leave room for multipart headers while bounding memory before formData parsing.
export const MAX_UPLOAD_REQUEST_BYTES = MAX_PHOTO_BYTES + 64 * 1024

type PhotoFormat = { mime: string; extension: string }

export function identifyPhoto(bytes: Uint8Array): PhotoFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { mime: 'image/jpeg', extension: 'jpg' }
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a)
    return { mime: 'image/png', extension: 'png' }
  if (bytes.length >= 12 &&
      String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP')
    return { mime: 'image/webp', extension: 'webp' }
  return null
}

export async function boundedMultipartForm(request: Request): Promise<FormData | null> {
  const contentType = request.headers.get('content-type') || ''
  if (!/^multipart\/form-data\s*;\s*boundary=/i.test(contentType) || !request.body) return null
  const statedLength = Number(request.headers.get('content-length') || 0)
  if (!Number.isFinite(statedLength) || statedLength > MAX_UPLOAD_REQUEST_BYTES) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_UPLOAD_REQUEST_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
    const body = Buffer.concat(chunks, length)
    return await new Request(request.url, {
      method: 'POST', headers: { 'content-type': contentType }, body,
    }).formData()
  } catch {
    return null
  }
}
