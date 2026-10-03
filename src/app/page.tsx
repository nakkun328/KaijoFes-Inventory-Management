'use client'
import Link from 'next/link'
import Image from 'next/image'
import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Header } from '@/components/header'
import { MemberPicker, useMemberSession } from '@/components/member-session'
import { useCatalog } from '@/components/use-catalog'
import { BulkMoveControls, useBulkSelection } from '@/components/bulk-move'
import { dateLabel, holderLabel, statusLabel } from '@/lib/display'
import { searchEquipments } from '@/lib/search'
import { groupEquipments, type EquipmentView } from '@/lib/equipment-groups'

type View = EquipmentView
const views: { id: View; label: string }[] = [
  { id: 'all', label: '一覧' }, { id: 'category', label: 'カテゴリ別' },
  { id: 'location', label: '保管場所別' }, { id: 'member', label: '所持者別' },
]

export default function Home() {
  return <Suspense fallback={<p className="p-8 text-center">備品を読み込み中…</p>}><HomeContent /></Suspense>
}

function HomeContent() {
  const { catalog, error, loading, reload } = useCatalog()
  const session = useMemberSession(catalog?.members || [])
  const initialQuery = useSearchParams().get('q') || ''
  const [search, setSearch] = useState(initialQuery)
  const [view, setView] = useState<View>('all')
  const selection = useBulkSelection()
  const filtered = useMemo(() => searchEquipments(catalog?.equipments || [], search), [catalog, search])
  const groups = useMemo(() => groupEquipments(filtered, view, catalog?.categories ?? []), [filtered, view, catalog?.categories])

  if (loading && !catalog) return <p className="p-8 text-center" role="status">備品を読み込み中…</p>
  if (error && !catalog) return <main role="alert" className="p-8 text-center">{error}<button onClick={() => void reload()} className="ml-2 underline">再試行</button></main>
  if (!catalog || !session.ready) return null
  if (!session.member) return <MemberPicker members={catalog.members} onSelect={session.select} />

  return <>
    <Header member={session.member} onChange={() => { if (!selection.busy) { selection.clear(); session.clear() } }} search={search} onSearch={setSearch} />
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-6">
      <div className="mb-5 flex items-end justify-between">
        <div><h1 className="text-2xl font-bold">備品を探す</h1><p className="mt-1 text-sm text-slate-600">{filtered.length}件の備品</p></div>
        <div className="flex gap-2"><button onClick={() => selection.setSelecting(true)} disabled={selection.busy || selection.selecting || !catalog.equipments.length} className="min-h-11 rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-40">まとめて移動</button>
          <button onClick={() => void reload()} disabled={loading || selection.busy} className="min-h-11 rounded-lg px-3 py-2 text-sm text-teal-800 underline disabled:opacity-50">{loading ? '更新中…' : '更新'}</button></div>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error} <button onClick={() => void reload()} className="underline">再試行</button></p>}
      {selection.selecting && <BulkMoveControls {...selection} items={filtered} members={catalog.members} locations={catalog.locations} actorId={session.member.id}
        onCancel={selection.clear} onDone={async () => { await reload() }} />}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2" aria-label="表示方法">
        {views.map((option) => <button key={option.id} onClick={() => setView(option.id)}
          aria-pressed={view === option.id}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${view === option.id ? 'bg-teal-800 text-white' : 'bg-white text-teal-800'}`}>
          {option.label}
        </button>)}
      </div>
      {filtered.length === 0 && <p className="rounded-xl bg-white p-6 text-slate-600">該当する備品がありません。</p>}
      {groups.map(([title, items]) => <section key={title} className="mb-7">
        {view !== 'all' && <h2 className="mb-3 text-lg font-bold">{title} <span className="text-sm font-normal text-slate-600">{items.length}件</span></h2>}
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => <article key={item.id} className={`rounded-2xl border bg-white shadow-sm ${selection.selected.some((entry) => entry.id === item.id) ? 'border-teal-700 ring-1 ring-teal-700' : 'border-slate-200'}`}>
            {selection.selecting && <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-2 text-sm font-semibold">
              <input type="checkbox" aria-label={`${item.name}（${item.management_number}）を選択`} checked={selection.selected.some((entry) => entry.id === item.id)}
                disabled={selection.busy || (selection.selected.length >= 100 && !selection.selected.some((entry) => entry.id === item.id))}
                onChange={() => selection.toggle(item)} className="h-5 w-5 accent-teal-800" />選択
            </label>}
            <Link href={`/equipments/${item.id}`} className="block rounded-2xl p-4 active:bg-teal-50">
            <div className="flex gap-4"><div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-sm text-slate-500">
              {item.images.length ? <Image src={`${(item.images.find((photo) => photo.is_primary) ?? item.images[0]).url}?width=160`}
                alt={`${item.name}の代表写真`} fill unoptimized sizes="80px" className="object-cover" /> : '写真なし'}
            </div>
              <div className="min-w-0"><h3 className="font-bold">{item.name}</h3><p className="mt-1 text-sm text-slate-600">{item.category.name}</p>
                <p className="mt-2 font-semibold text-teal-800">{holderLabel(item)}</p></div></div>
            <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
              <span>{statusLabel[item.status]}</span><span>更新 {dateLabel(item.updated_at)}</span>
            </div>
            </Link>
          </article>)}
        </div>
      </section>)}
    </main>
  </>
}
