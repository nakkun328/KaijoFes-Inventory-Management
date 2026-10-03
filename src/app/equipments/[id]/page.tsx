'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Header } from '@/components/header'
import { MemberPicker, useMemberSession } from '@/components/member-session'
import { useCatalog } from '@/components/use-catalog'
import { dateLabel, holderLabel, statusLabel } from '@/lib/display'
import type { Equipment, HolderType, Movement } from '@/lib/types'

type Detail = { equipment: Equipment; latest: Movement | null }
type Step = 'closed' | 'choose' | 'member' | 'location'

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { catalog, error: catalogError, loading: catalogLoading, reload: reloadCatalog } = useCatalog()
  const session = useMemberSession(catalog?.members || [])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [error, setError] = useState('')
  const [moveError, setMoveError] = useState('')
  const [step, setStep] = useState<Step>('closed')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const moveHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (step !== 'closed') {
      moveHeading.current?.focus({ preventScroll: true })
      moveHeading.current?.scrollIntoView({ block: 'start' })
    }
  }, [step])

  async function reload() {
    setDetailLoading(true)
    try {
      const response = await fetch(`/api/equipments/${id}`, { cache: 'no-store' })
      if (response.status === 404) { setDetail(null); setError('備品が見つかりません。'); return }
      if (!response.ok) throw new Error()
      setDetail(await response.json())
      setError('')
    } catch { setError('備品を読み込めませんでした。') }
    finally { setDetailLoading(false) }
  }
  useEffect(() => {
    let active = true
    fetch(`/api/equipments/${id}`, { cache: 'no-store' })
      .then((response) => {
        if (response.status === 404) throw new Error('備品が見つかりません。')
        if (!response.ok) throw new Error('備品を読み込めませんでした。')
        return response.json()
      })
      .then((data: Detail) => { if (active) { setDetail(data); setError('') } })
      .catch((cause: Error) => { if (active) setError(cause.message) })
      .finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [id])

  async function move(toType: HolderType, toId: string) {
    if (!detail || !session.member || saving) return
    setSaving(true)
    setMoveError('')
    try {
      const response = await fetch(`/api/equipments/${id}/move`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toType, toId, actorId: session.member.id, expectedUpdatedAt: detail.equipment.updated_at, note }),
      })
      if (!response.ok) {
        const result = await response.json()
        if (response.status === 409) await reload()
        throw new Error(result.error || '移動を保存できませんでした。')
      }
      setStep('closed')
      setNote('')
      setDetail(null)
      await reload()
    } catch (cause) { setMoveError(cause instanceof Error ? cause.message : '移動を保存できませんでした。') }
    finally { setSaving(false) }
  }

  if (!catalog || !session.ready) return <main className="mx-auto max-w-lg p-8 text-center" aria-live="polite">
    {catalogError ? <div role="alert">{catalogError}<button onClick={() => void reloadCatalog()} className="ml-2 underline">再試行</button></div>
      : <p>{catalogLoading ? '備品を読み込み中…' : '部員情報を読み込み中…'}</p>}
  </main>
  if (!session.member) return <MemberPicker members={catalog.members} onSelect={session.select} />
  const item = detail?.equipment
  const selectedImage = item?.images.find((photo) => photo.id === selectedImageId)
    ?? item?.images.find((photo) => photo.is_primary) ?? item?.images[0]
  return <>
    <Header member={session.member} onChange={session.clear} search={search} onSearch={setSearch}
      onSubmitSearch={() => router.push(`/?q=${encodeURIComponent(search)}`)} />
    <main className="mx-auto max-w-3xl px-4 pb-28 pt-5">
      <Link href="/" className="text-sm text-teal-800 underline">← 備品一覧へ</Link>
      {error && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-800">{error} <button onClick={() => void reload()} disabled={detailLoading} className="underline disabled:opacity-50">再試行</button></div>}
      {!item ? detailLoading ? <p className="mt-6" role="status">備品を読み込み中…</p> : null : <>
        <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm">
          <div className="relative flex h-56 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-500 sm:h-72">
            {selectedImage ? <Image src={`${selectedImage.url}?width=1280`} alt={`${item.name}の写真`} fill unoptimized
              sizes="(max-width: 640px) 100vw, 768px" className="object-contain" /> : '写真なし'}
          </div>
          {item.images.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto pb-2" aria-label="写真を選ぶ">
            {item.images.map((photo, index) => <button key={photo.id} type="button"
              onClick={() => setSelectedImageId(photo.id)} aria-label={`写真 ${index + 1} を表示`}
              aria-pressed={selectedImage?.id === photo.id}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-slate-100 sm:h-20 sm:w-20 ${selectedImage?.id === photo.id ? 'border-teal-700' : 'border-transparent'}`}>
              <Image src={`${photo.url}?width=160`} alt="" fill unoptimized sizes="80px" className="object-cover" />
            </button>)}
          </div>}
          <p className="mt-5 text-sm text-slate-600">{item.management_number} · {item.category.name}</p>
          <h1 className="mt-1 text-2xl font-bold">{item.name}</h1>
          <div className="mt-5 rounded-xl bg-teal-50 p-4">
            <p className="text-sm text-slate-600">現在位置</p>
            <p className="mt-1 text-xl font-bold text-teal-900">{holderLabel(item)}</p>
            <p className="mt-2 text-sm">{statusLabel[item.status]}</p>
          </div>
          <dl className="mt-5 grid gap-4 text-sm">
            <div><dt className="text-slate-600">通常保管場所</dt><dd className="font-semibold">{item.default_location?.name || '未設定'}</dd></div>
            {item.description && <div><dt className="text-slate-600">備考</dt><dd className="whitespace-pre-wrap">{item.description}</dd></div>}
            <div><dt className="text-slate-600">最終更新</dt><dd>{dateLabel(item.updated_at)}</dd></div>
          </dl>
        </div>
        {item.components.length > 0 && <section className="mt-4 rounded-2xl bg-white p-5"><h2 className="font-bold">セット内容</h2>
          <ul className="mt-3 space-y-2">{item.components.map((part) => <li key={part.id}>{part.name} ×{part.quantity}{part.note && ` · ${part.note}`}</li>)}</ul>
        </section>}
        <section className="mt-4 rounded-2xl bg-white p-5"><h2 className="font-bold">直近の移動</h2>
          {detail?.latest ? <div className="mt-3 text-sm"><p>{dateLabel(detail.latest.created_at)}</p>
            <p className="mt-2 font-semibold">{detail.latest.from_name_snapshot} → {detail.latest.to_name_snapshot}</p>
            <p className="mt-1 text-slate-600">変更者：{detail.latest.changed_by_name_snapshot}</p>
            {detail.latest.note && <p className="mt-1">{detail.latest.note}</p>}</div>
            : <p className="mt-3 text-sm text-slate-600">移動履歴はありません。</p>}
        </section>
        {step !== 'closed' && <section className="mt-5 scroll-mt-36 rounded-2xl border border-teal-200 bg-white p-5" aria-label="移動先を選ぶ">
          <div className="flex justify-between gap-3"><h2 ref={moveHeading} tabIndex={-1} className="scroll-mt-32 text-lg font-bold outline-none">移動先を選ぶ</h2>
            <button onClick={() => { setStep('closed'); setMoveError('') }} disabled={saving} className="min-h-11 px-2 text-sm underline disabled:opacity-50">閉じる</button></div>
          {moveError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{moveError}</p>}
          {step !== 'choose' && <button onClick={() => setStep('choose')} disabled={saving} className="mt-3 min-h-11 text-sm text-teal-800 underline disabled:opacity-50">← 選択に戻る</button>}
          <div className="mt-4 grid gap-3">
            {step === 'choose' && <>
              <button disabled={saving || (item.holder.type === 'member' && item.holder.id === session.member.id)}
                onClick={() => void move('member', session.member!.id)} className="min-h-14 rounded-xl bg-teal-800 px-4 text-left font-bold text-white disabled:opacity-40">自分が持つ</button>
              <button disabled={saving} onClick={() => setStep('member')} className="min-h-14 rounded-xl bg-slate-100 px-4 text-left font-bold disabled:opacity-50">他の部員に渡す</button>
              <button disabled={saving} onClick={() => setStep('location')} className="min-h-14 rounded-xl bg-slate-100 px-4 text-left font-bold disabled:opacity-50">保管場所へ移す</button>
            </>}
            {step === 'member' && catalog.members.filter((member) => member.id !== session.member?.id && !(item.holder.type === 'member' && item.holder.id === member.id))
              .map((member) => <button key={member.id} disabled={saving} onClick={() => void move('member', member.id)}
                className="min-h-14 rounded-xl bg-slate-100 px-4 text-left font-semibold disabled:opacity-40">{member.name}</button>)}
            {step === 'member' && catalog.members.filter((member) => member.id !== session.member?.id && !(item.holder.type === 'member' && item.holder.id === member.id)).length === 0 &&
              <p className="text-sm text-slate-600">移動できる部員がいません。</p>}
            {step === 'location' && catalog.locations.filter((location) => !(item.holder.type === 'location' && item.holder.id === location.id))
              .map((location) => <button key={location.id} disabled={saving} onClick={() => void move('location', location.id)}
                className="min-h-14 rounded-xl bg-slate-100 px-4 text-left font-semibold disabled:opacity-40">{location.name}</button>)}
            {step === 'location' && catalog.locations.filter((location) => !(item.holder.type === 'location' && item.holder.id === location.id)).length === 0 &&
              <p className="text-sm text-slate-600">移動できる保管場所がありません。</p>}
          </div>
          <details className="mt-4 text-sm"><summary className="cursor-pointer py-3 text-teal-800">メモを追加（任意）</summary>
            <textarea aria-label="移動メモ" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500}
              placeholder="例：ケースも一緒に移動" className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 p-3" />
          </details>
          {saving && <p role="status" className="mt-3 text-sm">移動を保存中…</p>}
        </section>}
        {step === 'closed' && <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white p-4 sm:static sm:mt-5 sm:border-0 sm:bg-transparent sm:p-0">
          <button onClick={() => setStep('choose')} disabled={saving}
            className="mx-auto block min-h-14 w-full max-w-3xl rounded-xl bg-teal-800 px-6 text-lg font-bold text-white shadow-lg disabled:opacity-50">移動する</button>
        </div>}
      </>}
    </main>
  </>
}
