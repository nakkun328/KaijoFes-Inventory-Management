'use client'
import Link from 'next/link'
import Image from 'next/image'
import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Header } from '@/components/header'
import { MemberPicker, useMemberSession } from '@/components/member-session'
import { useCatalog } from '@/components/use-catalog'
import { dateLabel, holderLabel, statusLabel } from '@/lib/display'
import { searchEquipments } from '@/lib/search'
import type { Equipment } from '@/lib/types'

type View = 'all' | 'category' | 'location' | 'member'
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
  const filtered = useMemo(() => searchEquipments(catalog?.equipments || [], search), [catalog, search])
  const groups = useMemo(() => {
    if (view === 'all') return [['すべて', filtered]] as [string, Equipment[]][]
    const map = new Map<string, Equipment[]>()
    for (const item of filtered) {
      const key = view === 'category' ? item.category.name : view === 'member'
        ? item.holder.type === 'member' ? item.holder.name : '保管場所にある備品'
        : item.holder.type === 'location' ? item.holder.name : '部員が所持中'
      map.set(key, [...(map.get(key) || []), item])
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'ja'))
  }, [filtered, view])

  if (loading && !catalog) return <p className="p-8 text-center" role="status">備品を読み込み中…</p>
  if (error && !catalog) return <main role="alert" className="p-8 text-center">{error}<button onClick={() => void reload()} className="ml-2 underline">再試行</button></main>
  if (!catalog || !session.ready) return null
  if (!session.member) return <MemberPicker members={catalog.members} onSelect={session.select} />

  return <>
    <Header member={session.member} onChange={session.clear} search={search} onSearch={setSearch} />
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-6">
      <div className="mb-5 flex items-end justify-between">
        <div><h1 className="text-2xl font-bold">備品を探す</h1><p className="mt-1 text-sm text-slate-600">{filtered.length}件の備品</p></div>
        <button onClick={() => void reload()} disabled={loading} className="min-h-11 rounded-lg px-3 py-2 text-sm text-teal-800 underline disabled:opacity-50">{loading ? '更新中…' : '更新'}</button>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error} <button onClick={() => void reload()} className="underline">再試行</button></p>}
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
          {items.map((item) => <Link href={`/equipments/${item.id}`} key={item.id}
            className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm active:bg-teal-50">
            <div className="flex gap-4"><div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-sm text-slate-500">
              {item.images.length ? <Image src={(item.images.find((photo) => photo.is_primary) ?? item.images[0]).url}
                alt={`${item.name}の代表写真`} fill unoptimized sizes="80px" className="object-cover" /> : '写真なし'}
            </div>
              <div className="min-w-0"><h3 className="font-bold">{item.name}</h3><p className="mt-1 text-sm text-slate-600">{item.category.name}</p>
                <p className="mt-2 font-semibold text-teal-800">{holderLabel(item)}</p></div></div>
            <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
              <span>{statusLabel[item.status]}</span><span>更新 {dateLabel(item.updated_at)}</span>
            </div>
          </Link>)}
        </div>
      </section>)}
    </main>
  </>
}
