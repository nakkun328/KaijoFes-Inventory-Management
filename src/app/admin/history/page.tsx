'use client'
import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { AdminAlert, AdminHeading, inputClass, secondaryButton } from '@/components/admin/shell'
import { adminRequest, displayDate, errorMessage, type AdminHistory, type PageResult } from '@/components/admin/api'
type Filters = { q: string; fromDate: string; toDate: string; from: string; to: string; actor: string }
const empty: Filters = { q: '', fromDate: '', toDate: '', from: '', to: '', actor: '' }
export default function History() {
  const [draft, setDraft] = useState<Filters>(empty)
  const [filters, setFilters] = useState<Filters>(empty)
  const [items, setItems] = useState<AdminHistory[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const params = new URLSearchParams({ page: String(page), pageSize: '20' })
    for (const [key, value] of Object.entries(filters)) if (value.trim()) params.set(key, value.trim())
    try { const result = await adminRequest<PageResult<AdminHistory>>(`/api/admin/history?${params}`); setItems(result.items); setTotal(result.total) }
    catch (cause) { setError(errorMessage(cause)) } finally { setLoading(false) }
  }, [filters, page])
  useEffect(() => { void Promise.resolve().then(load) }, [load])
  function submit(event: FormEvent) { event.preventDefault(); setPage(1); setFilters({ ...draft }) }
  const fields: { key: keyof Filters; label: string; type?: string }[] = [
    { key: 'q', label: '備品名・管理番号' }, { key: 'fromDate', label: '開始日', type: 'date' }, { key: 'toDate', label: '終了日', type: 'date' },
    { key: 'from', label: '移動元' }, { key: 'to', label: '移動先' }, { key: 'actor', label: '変更者' },
  ]
  return <><AdminHeading title="全移動履歴" description={`${total}件の履歴`} />
    <form onSubmit={submit} className="mb-5 rounded-xl border border-slate-200 bg-white p-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{fields.map((field) => <label key={field.key} className="text-sm font-semibold">{field.label}<input type={field.type ?? 'search'} className={`mt-1 ${inputClass}`} value={draft[field.key]} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} /></label>)}</div>
      <div className="mt-4 flex gap-2"><button className={secondaryButton}>絞り込む</button><button type="button" className={secondaryButton} onClick={() => { setDraft(empty); setFilters(empty); setPage(1) }}>解除</button></div></form>
    <AdminAlert message={error} />
    {loading ? <p role="status">履歴を読み込み中…</p> : items.length === 0 ? <p className="rounded-xl bg-white p-6 text-slate-600">該当する履歴がありません。</p> : <>
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white lg:block"><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-3">日時</th><th className="p-3">備品</th><th className="p-3">移動元</th><th className="p-3">移動先</th><th className="p-3">変更者</th><th className="p-3">メモ</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item.id}><td className="p-3">{displayDate(item.created_at)}</td><td className="p-3"><Link href={`/admin/equipments/${item.equipment_id}`} className="font-semibold text-teal-800 underline">{item.equipment?.name ?? item.equipment_name ?? item.management_number ?? item.equipment_id}</Link></td><td className="p-3">{item.from_name_snapshot}</td><td className="p-3">{item.to_name_snapshot}</td><td className="p-3">{item.changed_by_name_snapshot}</td><td className="p-3">{item.note ?? '—'}</td></tr>)}</tbody></table></div>
      <div className="grid gap-3 lg:hidden">{items.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{displayDate(item.created_at)}</p><Link href={`/admin/equipments/${item.equipment_id}`} className="mt-1 block font-bold text-teal-800 underline">{item.equipment?.name ?? item.equipment_name ?? item.management_number ?? item.equipment_id}</Link><p className="mt-2 text-sm">{item.from_name_snapshot} → {item.to_name_snapshot}</p><p className="mt-2 text-xs text-slate-600">変更者：{item.changed_by_name_snapshot}</p>{item.note && <p className="mt-2 text-sm">{item.note}</p>}</article>)}</div>
      <div className="mt-5 flex items-center justify-between"><button className={secondaryButton} disabled={page <= 1} onClick={() => setPage(page - 1)}>前へ</button><span className="text-sm">{page} / {Math.max(1, Math.ceil(total / 20))} ページ</span><button className={secondaryButton} disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>次へ</button></div>
    </>}
  </>
}
