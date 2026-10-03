'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { BulkMoveControls, useBulkSelection } from '@/components/bulk-move'
import { AdminAlert, AdminHeading, inputClass, primaryButton, secondaryButton } from './shell'
import { adminRequest, displayDate, errorMessage, statusNames, type AdminCategory, type AdminEquipment, type AdminMember, type AdminLocation, type PageResult, type ReferenceLists } from './api'
export function EquipmentList({ deleted = false }: { deleted?: boolean }) {
  const [items, setItems] = useState<AdminEquipment[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [members, setMembers] = useState<AdminMember[]>([])
  const [locations, setLocations] = useState<AdminLocation[]>([])
  const [refsError, setRefsError] = useState('')
  const selection = useBulkSelection()
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const params = new URLSearchParams({ page: String(page), pageSize: '20', deleted: deleted ? 'deleted' : 'active' })
    if (query) params.set('q', query)
    if (categoryId) params.set('categoryId', categoryId)
    if (status) params.set('status', status)
    try {
      const result = await adminRequest<PageResult<AdminEquipment>>(`/api/admin/equipments?${params}`)
      setItems(result.items); setTotal(result.total)
    } catch (cause) { setError(errorMessage(cause)) } finally { setLoading(false) }
  }, [page, query, categoryId, status, deleted])
  useEffect(() => { void Promise.resolve().then(load) }, [load])
  useEffect(() => {
    let active = true
    adminRequest<ReferenceLists>('/api/admin/references').then(({ categories, members, locations }) => {
      if (!active) return
      setCategories(categories)
      setMembers(members.filter((item) => item.active)); setLocations(locations.filter((item) => item.active))
    }).catch(() => { if (active) setRefsError('カテゴリ・部員・保管場所を読み込めませんでした。画面を再読み込みしてください。') })
    return () => { active = false }
  }, [])
  async function changeDeleted(item: AdminEquipment) {
    const action = deleted ? '復元' : '削除'
    if (!window.confirm(`${item.name}（${item.management_number}）を${action}しますか？`)) return
    setBusyId(item.id); setError('')
    try { await adminRequest(`/api/admin/equipments/${item.id}${deleted ? '/restore' : ''}`, { method: deleted ? 'POST' : 'DELETE' }); await load() }
    catch (cause) { setError(errorMessage(cause)) } finally { setBusyId('') }
  }
  return <><AdminHeading title={deleted ? '削除済み備品' : '備品管理'} description={`${total}件の備品`}
    action={!deleted ? <div className="flex flex-wrap gap-2"><button className={secondaryButton} disabled={loading || selection.selecting || Boolean(busyId) || Boolean(refsError) || !total} onClick={() => selection.setSelecting(true)}>まとめて移動</button><Link href="/admin/equipments/new" className={primaryButton}>備品を追加</Link></div> : undefined} />
    <AdminAlert message={error} />
    <AdminAlert message={refsError} />
    <form className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_12rem_10rem_auto]" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(search.trim()) }}>
      <label className="text-sm font-semibold">検索<input aria-label="備品を検索" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="備品名・管理番号" className={`mt-1 ${inputClass}`} /></label>
      <label className="text-sm font-semibold">カテゴリ<select className={`mt-1 ${inputClass}`} value={categoryId} onChange={(event) => { setPage(1); setCategoryId(event.target.value) }}><option value="">すべて</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="text-sm font-semibold">状態<select className={`mt-1 ${inputClass}`} value={status} onChange={(event) => { setPage(1); setStatus(event.target.value) }}><option value="">すべて</option>{Object.entries(statusNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      <button className={`${secondaryButton} self-end`}>検索</button>
    </form>
    {!deleted && selection.selecting && <BulkMoveControls {...selection} items={loading ? [] : items} members={members} locations={locations}
      endpoint="/api/admin/equipments/bulk-move" onCancel={selection.clear} onDone={load} />}
    {loading ? <p role="status">備品を読み込み中…</p> : items.length === 0 ? <p className="rounded-xl bg-white p-6 text-slate-600">該当する備品がありません。</p> : <>
              <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white lg:block"><table className="w-full text-left text-sm"><thead className="bg-slate-100 text-slate-700"><tr>{!deleted && selection.selecting && <th className="p-3">選択</th>}<th className="p-3">備品</th><th className="p-3">カテゴリ</th><th className="p-3">現在地</th><th className="p-3">状態</th><th className="p-3">{deleted ? '削除日時' : '最終更新'}</th><th className="p-3">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item.id}>{!deleted && selection.selecting && <td className="p-3">{!deleted && selection.selecting && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" aria-label={`${item.name}（${item.management_number}）を選択`} checked={selection.selected.some((entry) => entry.id === item.id)} disabled={selection.busy || Boolean(busyId) || (selection.selected.length >= 100 && !selection.selected.some((entry) => entry.id === item.id))} onChange={() => selection.toggle(item)} className="h-5 w-5 accent-teal-800" /><span>選択</span></label>}</td>}<td className="p-3 font-semibold">{item.name}<span className="block text-xs font-normal text-slate-500">{item.management_number}</span></td><td className="p-3">{item.category?.name ?? '—'}</td><td className="p-3">{item.current_member?.name ?? item.current_location?.name ?? '—'}</td><td className="p-3">{statusNames[item.status]}</td><td className="p-3">{displayDate(deleted ? item.deleted_at : item.updated_at)}</td><td className="p-3"><div className="flex gap-2">{!deleted && <Link href={`/admin/equipments/${item.id}`} className="rounded-lg border px-3 py-2">編集</Link>}<Link href={`/admin/equipments/${item.id}/photos`} className="rounded-lg border px-3 py-2">写真</Link><button type="button" disabled={Boolean(busyId) || selection.busy} className="rounded-lg border px-3 py-2 disabled:opacity-50" onClick={() => void changeDeleted(item)}>{busyId === item.id ? '処理中…' : deleted ? '復元' : '削除'}</button></div></td></tr>)}</tbody></table></div>
      <div className="grid gap-3 lg:hidden">{items.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">{!deleted && selection.selecting && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" aria-label={`${item.name}（${item.management_number}）を選択`} checked={selection.selected.some((entry) => entry.id === item.id)} disabled={selection.busy || Boolean(busyId) || (selection.selected.length >= 100 && !selection.selected.some((entry) => entry.id === item.id))} onChange={() => selection.toggle(item)} className="h-5 w-5 accent-teal-800" /><span>選択</span></label>}<h2 className="font-bold">{item.name}</h2><p className="text-xs text-slate-500">{item.management_number}</p><p className="mt-2 text-sm">{item.category?.name ?? '—'} · {statusNames[item.status]}</p><p className="mt-1 text-sm">現在地：{item.current_member?.name ?? item.current_location?.name ?? '—'}</p><p className="mt-1 text-xs text-slate-500">{deleted ? '削除' : '更新'}：{displayDate(deleted ? item.deleted_at : item.updated_at)}</p><div className="mt-4 flex flex-wrap gap-2">{!deleted && <Link className={secondaryButton} href={`/admin/equipments/${item.id}`}>編集</Link>}<Link className={secondaryButton} href={`/admin/equipments/${item.id}/photos`}>写真</Link><button className={secondaryButton} disabled={Boolean(busyId) || selection.busy} onClick={() => void changeDeleted(item)}>{busyId === item.id ? '処理中…' : deleted ? '復元' : '削除'}</button></div></article>)}</div>
      <div className="mt-5 flex items-center justify-between"><button className={secondaryButton} disabled={page <= 1} onClick={() => setPage(page - 1)}>前へ</button><span className="text-sm">{page} / {Math.max(1, Math.ceil(total / 20))} ページ</span><button className={secondaryButton} disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>次へ</button></div>
    </>}
  </>
}
