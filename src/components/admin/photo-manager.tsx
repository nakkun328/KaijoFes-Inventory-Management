'use client'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { adminRequest, errorMessage } from './api'
import { AdminAlert, primaryButton, secondaryButton } from './shell'

type Photo = { id: string; url: string; sort_order: number; is_primary: boolean }
const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxBytes = 4 * 1024 * 1024

export function PhotoManager({ equipmentId, deleted = false }: { equipmentId: string; deleted?: boolean }) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const endpoint = `/api/admin/equipments/${equipmentId}/images`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adminRequest<{ items: Photo[] }>(endpoint)
      setPhotos(result.items)
      setError('')
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [endpoint])
  useEffect(() => { void Promise.resolve().then(load) }, [load])

  async function upload() {
    const files = [...(input.current?.files ?? [])]
    if (!files.length) return
    for (const file of files) {
      if (!acceptedTypes.has(file.type) || file.size === 0 || file.size > maxBytes) {
        setError('JPEG・PNG・WebP の画像を選び、1枚あたり4MB以下にしてください。')
        return
      }
    }
    setBusy(true); setError('')
    try {
      for (const file of files) {
        const body = new FormData()
        body.set('file', file)
        await adminRequest(endpoint, { method: 'POST', body })
      }
      if (input.current) input.current.value = ''
      await load()
    } catch (cause) { await load(); setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  async function arrange(ordered: Photo[], primaryId: string) {
    setBusy(true); setError('')
    try {
      await adminRequest(endpoint, { method: 'PATCH', body: JSON.stringify({
        ordered_ids: ordered.map((photo) => photo.id), primary_id: primaryId,
      }) })
      await load()
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  async function remove(photo: Photo) {
    if (!window.confirm('この写真を削除しますか？')) return
    setBusy(true); setError('')
    try {
      await adminRequest(`${endpoint}/${photo.id}`, { method: 'DELETE' })
      await load()
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  const primaryId = photos.find((photo) => photo.is_primary)?.id ?? photos[0]?.id
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-label="備品写真">
    <h2 className="text-lg font-bold">写真</h2>
    <p className="mt-1 text-sm text-slate-600">JPEG・PNG・WebP、1枚4MBまで。代表画像は個別に選べます。</p>
    <AdminAlert message={error} />
    {deleted ? <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">削除済み備品です。写真の追加は復元後に行えます。</p>
      : <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="block text-sm font-semibold">写真を選ぶ
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy}
          className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 p-2 text-sm" />
      </label>
      <button type="button" disabled={busy} onClick={() => void upload()} className={primaryButton}>{busy ? '処理中…' : '写真を追加'}</button>
    </div>}
    {loading ? <p className="mt-5" role="status">写真を読み込み中…</p> : photos.length === 0
      ? <div className="mt-5 flex h-36 items-center justify-center rounded-xl bg-slate-100 text-slate-500">写真はまだありません</div>
      : <ol className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {photos.map((photo, index) => <li key={photo.id} className="rounded-xl border border-slate-200 p-3">
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-100">
            <Image src={photo.url} alt={`備品写真 ${index + 1}`} fill unoptimized sizes="(max-width: 640px) 100vw, 33vw" className="object-contain" />
          </div>
          <p className="mt-2 text-sm font-semibold">{photo.is_primary ? '代表画像' : `写真 ${index + 1}`}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!photo.is_primary && <button type="button" disabled={busy} className={secondaryButton}
              onClick={() => void arrange(photos, photo.id)}>代表にする</button>}
            <button type="button" disabled={busy || index === 0} className={secondaryButton} onClick={() => {
              const next = [...photos]; [next[index - 1], next[index]] = [next[index], next[index - 1]]
              void arrange(next, primaryId)
            }}>前へ</button>
            <button type="button" disabled={busy || index === photos.length - 1} className={secondaryButton} onClick={() => {
              const next = [...photos]; [next[index], next[index + 1]] = [next[index + 1], next[index]]
              void arrange(next, primaryId)
            }}>後へ</button>
            <button type="button" disabled={busy} className={secondaryButton} onClick={() => void remove(photo)}>削除</button>
          </div>
        </li>)}
      </ol>}
  </section>
}
