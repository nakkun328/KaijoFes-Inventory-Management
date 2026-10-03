'use client'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { AdminAlert, AdminHeading, inputClass, primaryButton, secondaryButton } from './shell'
import { adminRequest, errorMessage, type AdminCategory, type AdminLocation, type AdminMember } from './api'

type Kind = 'members' | 'categories' | 'locations'
type Row = AdminMember | AdminCategory | AdminLocation
const titles: Record<Kind, string> = { members: '部員管理', categories: 'カテゴリ管理', locations: '保管場所管理' }
export function MasterList({ kind }: { kind: Kind }) {
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Row | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState(0)
  const [active, setActive] = useState(true)
  function mergeSaved(row: Row) {
    setItems((current) => [...current.filter((item) => item.id !== row.id), row].sort((a, b) =>
      (kind === 'categories' && 'sort_order' in a && 'sort_order' in b ? a.sort_order - b.sort_order : 0)
      || a.name.localeCompare(b.name, 'ja')))
  }
  const load = useCallback(async () => {
    setLoading(true)
    try { const result = await adminRequest<{ items: Row[] }>(`/api/admin/${kind}`); setItems(result.items); setError('') }
    catch (cause) { setError(errorMessage(cause)) } finally { setLoading(false) }
  }, [kind])
  useEffect(() => { void Promise.resolve().then(load) }, [load])
  function select(row: Row | null) {
    setEditing(row); setName(row?.name ?? '')
    setDescription(row && 'description' in row ? row.description ?? '' : '')
    setSortOrder(row && 'sort_order' in row ? row.sort_order : 0)
    setActive(row && 'active' in row ? row.active : true)
    setError('')
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (loading || busy) return
    setBusy(true); setError('')
    const payload = kind === 'categories' ? { name: name.trim(), sort_order: sortOrder }
      : kind === 'locations' ? { name: name.trim(), description: description.trim() || null, active }
      : { name: name.trim(), active }
    try {
      const result = await adminRequest<{ item: Row }>(`/api/admin/${kind}${editing ? `/${editing.id}` : ''}`, { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      mergeSaved(result.item); select(null)
    } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  async function toggle(row: Row) {
    if (!('active' in row)) return
    if (!window.confirm(`${row.name}を${row.active ? '無効化' : '有効化'}しますか？`)) return
    setBusy(true); setError('')
    try { const result = await adminRequest<{ item: Row }>(`/api/admin/${kind}/${row.id}`, { method: 'PATCH', body: JSON.stringify({ active: !row.active }) }); mergeSaved(result.item) }
    catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  const singular = kind === 'members' ? '部員' : kind === 'categories' ? 'カテゴリ' : '保管場所'
  return <><AdminHeading title={titles[kind]} description="過去の履歴を保つため、部員と保管場所は無効化して管理します。"
    action={<button className={secondaryButton} disabled={loading || busy} onClick={() => void load()}>{loading ? '更新中…' : '一覧を更新'}</button>} />
    <div className="grid gap-5 xl:grid-cols-[minmax(20rem,1fr)_minmax(17rem,24rem)]">
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="mb-4 text-lg font-bold">登録一覧</h2>
        {loading ? <p role="status">読み込み中…</p> : items.length === 0 ? <p className="text-sm text-slate-600">登録がありません。</p> : <div className="divide-y divide-slate-100">{items.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{row.name}</p><p className="text-xs text-slate-500">{'active' in row ? row.active ? '有効' : '無効' : `表示順 ${row.sort_order}`}{'description' in row && row.description ? ` · ${row.description}` : ''}</p></div><div className="flex gap-2"><button className={secondaryButton} onClick={() => select(row)}>編集</button>{'active' in row && <button className={secondaryButton} disabled={busy} onClick={() => void toggle(row)}>{row.active ? '無効化' : '有効化'}</button>}</div></div>)}</div>}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="mb-4 text-lg font-bold">{editing ? `${singular}を編集` : `${singular}を追加`}</h2><AdminAlert message={error} />
        <form onSubmit={submit} className="space-y-4"><div><label htmlFor="master-name" className="mb-1 block text-sm font-semibold">名前 *</label><input id="master-name" className={inputClass} required maxLength={150} value={name} onChange={(event) => setName(event.target.value)} /></div>
          {kind === 'locations' && <div><label htmlFor="master-description" className="mb-1 block text-sm font-semibold">説明</label><textarea id="master-description" className={inputClass} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></div>}
          {kind === 'categories' && <div><label htmlFor="master-sort" className="mb-1 block text-sm font-semibold">表示順</label><input id="master-sort" className={inputClass} type="number" step="1" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} /></div>}
          {kind !== 'categories' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />有効</label>}
          <div className="flex flex-wrap gap-2"><button className={primaryButton} disabled={busy || loading}>{busy ? '保存中…' : '保存する'}</button>{editing && <button type="button" className={secondaryButton} onClick={() => select(null)}>編集をやめる</button>}</div>
        </form>
      </section>
    </div>
  </>
}
