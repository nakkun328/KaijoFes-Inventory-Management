'use client'
import Link from 'next/link'
import type { Named } from '@/lib/types'

export function Header({ member, onChange, search, onSearch, onSubmitSearch }: {
  member: Named; onChange: () => void; search?: string; onSearch?: (value: string) => void; onSubmitSearch?: () => void
}) {
  return <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="font-bold text-teal-900">広報部 備品管理</Link>
        <button onClick={onChange} className="rounded-lg px-2 py-2 text-sm text-teal-800 underline">{member.name} · 利用者を変更</button>
      </div>
      {onSearch && <form onSubmit={(event) => { event.preventDefault(); onSubmitSearch?.() }}><input type="search" value={search || ''} onChange={(event) => onSearch(event.target.value)}
        placeholder="備品名・番号・場所などで検索" aria-label="備品を検索"
        className="mt-3 h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 text-base outline-teal-600" /></form>}
    </div>
  </header>
}
