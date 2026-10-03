import 'server-only'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const mimeTypes: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const widths = new Set([160, 640, 1280])

// Call only AFTER checking current photo visibility (and admin auth where needed).
// Stored object paths are immutable UUIDs; upload never overwrites an existing path.
export async function photoResponse(request: Request, storagePath: string, download: () => Promise<Blob>) {
  const mime = mimeTypes[storagePath.split('.').pop()?.toLowerCase() ?? '']
  if (!mime) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const requested = new URL(request.url).searchParams.get('width')
  const width = requested && widths.has(Number(requested)) ? Number(requested) : null
  const etag = `"${createHash('sha256').update(`photo-v1:${storagePath}:${width ?? 'original'}`).digest('hex')}"`
  const headers = new Headers({
    // Keep bytes in the browser, but validate access/deletion on EVERY reuse.
    // No shared CDN cache or public Storage access is introduced.
    'Cache-Control': 'private, no-cache',
    'ETag': etag,
    'Content-Type': width ? 'image/webp' : mime,
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
  })
  const matches = (request.headers.get('if-none-match') ?? '').split(',').map((value) => value.trim().replace(/^W\//, ''))
  if (matches.includes(etag) || matches.includes('*')) return new Response(null, { status: 304, headers })
  const original = await download()
  const bytes = width ? await sharp(Buffer.from(await original.arrayBuffer()))
    .rotate().resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
    : Buffer.from(await original.arrayBuffer())
  headers.set('Content-Length', String(bytes.byteLength))
  return new Response(new Uint8Array(bytes), { headers })
}
