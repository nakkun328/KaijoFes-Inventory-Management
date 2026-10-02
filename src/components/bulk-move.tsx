'use client'
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { MAX_BULK_MOVE, type BulkMoveItem, type BulkMoveResult } from '@/lib/bulk-move-types'
import type { Named } from '@/lib/types'

export function useBulkSelection() {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<BulkMoveItem[]>([])
  const [busy, setBusy] = useState(false)
  function toggle(item: BulkMoveItem) {
    if (busy) return
    setSelected((current) => current.some((entry) => entry.id === item.id)
      ? current.filter((entry) => entry.id !== item.id)
      : current.length < MAX_BULK_MOVE ? [...current, item] : current)
  }
  function clear() { setSelected([]); setSelecting(false) }
  return { selecting, setSelecting, selected, setSelected, busy, setBusy, toggle, clear }
}

const button = 'min-h-11 rounded-xl border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-900 disabled:opacity-40'
const input = 'mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2'

export function BulkMoveControls({ items, selected, setSelected, members, locations, actorId,
  busy, setBusy, onDone, onCancel, endpoint = '/api/equipments/bulk-move' }: {
  items: BulkMoveItem[]; selected: BulkMoveItem[]; setSelected: Dispatch<SetStateAction<BulkMoveItem[]>>;
  members: Named[]; locations: Named[]; actorId?: string; busy: boolean; setBusy: (value: boolean) => void;
  onDone: () => Promise<void>; onCancel: () => void; endpoint?: string;
}) {
  const [open, setOpen] = useState(false)
  const [destination, setDestination] = useState('')
  const [actor, setActor] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const selectedActor = actorId || actor
  const allVisibleSelected = items.length > 0 && items.every((item) => selected.some((entry) => entry.id === item.id))
  const combinedCount = new Set([...selected, ...items].map((item) => item.id)).size
  const [toType, toId] = destination.split(':')
  const toName = (toType === 'location' ? locations : members).find((item) => item.id === toId)?.name
  useEffect(() => {
    if (open) { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'center' }) }
  }, [open])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !selected.length || !toName || !members.some((member) => member.id === selectedActor)) return
    setBusy(true); setError('')
    try {
      const response = await fetch(endpoint, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selected.map((item) => ({ id: item.id, expectedUpdatedAt: item.updated_at })),
          toType, toId, actorId: selectedActor, note }),
      })
      const result = await response.json()
      if (!response.ok) {
        if (response.status === 409) { setSelected([]); setOpen(false); await onDone() }
        throw new Error(result.error || '保存結果を確認できませんでした。一覧を更新してください。')
      }
      const { movedCount, skippedCount } = result as BulkMoveResult
      setOpen(false); setSelected([])
      await onDone()
      setError('')
      // Keep the result visible even after the selection is cleared.
      setResult(movedCount === 0
        ? `選択した${skippedCount}件はすでに「${toName}」にあります。現在位置と履歴は変更していません。`
        : `${movedCount}件を「${toName}」へ移動しました。${skippedCount ? ` ${skippedCount}件はすでに移動先にあるため変更していません。` : ''}`)
      setNote('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存結果を確認できませんでした。一覧を更新し、現在位置と履歴を確認してください。')
    } finally { setBusy(false) }
  }
  return <section aria-label="一括移動" className="mb-5 rounded-2xl border border-teal-200 bg-teal-50 p-4">
    <div className="flex flex-wrap items-center gap-3">
      <p className="font-bold" aria-live="polite">{selected.length}件を選択中 <span className="text-xs font-normal">（最大100件）</span></p>
      <button className={button} disabled={busy || !items.length || (!allVisibleSelected && combinedCount > MAX_BULK_MOVE)} onClick={() => {
        setError(''); setResult('')
        setSelected((current) => allVisibleSelected ? current.filter((item) => !items.some((visible) => visible.id === item.id))
          : [...current, ...items.filter((item) => !current.some((entry) => entry.id === item.id))])
      }}>{allVisibleSelected ? '表示中の選択を解除' : '表示中を全選択'}</button>
      <button className={`${button} bg-teal-800 text-white`} disabled={busy || !selected.length} onClick={() => { setOpen(true); setError(''); setResult('') }}>選択した備品を移動</button>
      <button className={button} disabled={busy} onClick={onCancel}>選択を終了</button>
    </div>
    <p className="mt-2 text-xs text-slate-600">検索やページを変えても選択を保持します。保存前に下の対象一覧を確認してください。</p>
    {result && <p role="status" className="mt-3 font-semibold text-teal-900">{result}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
    {open && selected.length > 0 && <form onSubmit={(event) => void save(event)} className="mt-4 border-t border-teal-200 pt-4">
      <h2 ref={heading} tabIndex={-1} className="scroll-mt-40 text-lg font-bold outline-none">一括移動を確認</h2>
      <fieldset disabled={busy} className="mt-3 space-y-4">
        <div><p className="text-sm font-semibold">対象：{selected.length}件</p><ul className="mt-2 max-h-44 overflow-y-auto rounded-xl bg-white p-3 text-sm">
          {selected.map((item) => <li key={item.id} className="py-1">{item.name}{item.management_number && <span className="ml-2 text-xs text-slate-500">{item.management_number}</span>}</li>)}
        </ul></div>
        <label className="block text-sm font-semibold">移動先<select required aria-label="一括移動先" value={destination} onChange={(event) => setDestination(event.target.value)} className={input}>
          <option value="">移動先を選んでください</option>
          <optgroup label="保管場所">{locations.map((item) => <option key={item.id} value={`location:${item.id}`}>{item.name}</option>)}</optgroup>
          <optgroup label="部員">{members.map((item) => <option key={item.id} value={`member:${item.id}`}>{item.name}</option>)}</optgroup>
        </select></label>
        {actorId ? <p className="text-sm">変更者：{members.find((member) => member.id === actorId)?.name}</p>
          : <label className="block text-sm font-semibold">変更者（部員）<select required aria-label="一括移動の変更者" value={actor} onChange={(event) => setActor(event.target.value)} className={input}>
            <option value="">実際に移動する部員を選んでください</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select></label>}
        <label className="block text-sm font-semibold">メモ（任意・全件共通）<textarea aria-label="一括移動メモ" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className={`${input} min-h-20`} /></label>
        <p className="text-sm text-slate-700">{toName ? `${selected.length}件を「${toName}」へ移動します。` : '移動先を選んでください。'}履歴は備品ごとに残ります。すでに移動先にある備品は変更しません。</p>
        <div className="flex flex-wrap gap-3"><button disabled={!toName || !selectedActor} className={`${button} bg-teal-800 text-white`}>{busy ? '保存中…' : `${selected.length}件を移動する`}</button>
          <button type="button" onClick={() => setOpen(false)} className={button}>戻る</button></div>
      </fieldset>
    </form>}
  </section>
}
