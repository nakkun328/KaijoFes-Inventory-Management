'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { adminRequest, AdminHttpError, errorMessage } from './api'

const links = [
  { href: '/admin', label: 'ダッシュボード' },
  { href: '/admin/equipments', label: '備品管理' },
  { href: '/admin/history', label: '移動履歴' },
  { href: '/admin/members', label: '部員管理' },
  { href: '/admin/categories', label: 'カテゴリ管理' },
  { href: '/admin/locations', label: '保管場所管理' },
  { href: '/admin/equipments/deleted', label: '削除済み備品' },
  { href: '/admin/backup', label: 'バックアップ' },
]
export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (path === '/admin/login') { return }
    adminRequest<{ user: { id: string; email: string } }>('/api/admin/auth/session').then((session) => {
      if (!active) return
      if (!session.user) router.replace('/admin/login')
      else setAuthenticated(true)
    }).catch((cause) => { if (active) { if (cause instanceof AdminHttpError && cause.status === 401) router.replace('/admin/login'); else setError(errorMessage(cause)) } }).finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [path, router])
  if (path === '/admin/login') return children
  if (checking) return <main className="p-8 text-center" role="status">管理者認証を確認中…</main>
  if (error) return <main className="mx-auto max-w-xl p-8" role="alert"><p>{error}</p><button onClick={() => location.reload()} className="mt-3 underline">再試行</button></main>
  if (!authenticated) return null
  return <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
    <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between px-4 py-4 lg:block lg:px-5 lg:py-6">
        <div><p className="text-xs font-semibold tracking-wide text-teal-700">文化祭実行委員会 広報部</p><p className="mt-1 text-lg font-bold">備品管理 / 管理者</p></div>
        <button className="rounded-lg border px-3 py-2 text-sm lg:mt-5" onClick={async () => {
          try { await adminRequest('/api/admin/auth/logout', { method: 'POST' }); setAuthenticated(false); setChecking(true); router.replace('/admin/login') }
          catch (cause) { setError(errorMessage(cause)) }
        }}>ログアウト</button>
      </div>
      <nav aria-label="管理者メニュー" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:px-3">
        {links.map((link) => <Link key={link.href} href={link.href} aria-current={path === link.href ? 'page' : undefined}
          className={`block shrink-0 rounded-lg px-3 py-2.5 text-sm font-medium lg:mb-1 ${path === link.href ? 'bg-teal-800 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>{link.label}</Link>)}
      </nav>
    </aside>
    <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
  </div>
}
export function AdminHeading({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight">{title}</h1>{description && <p className="mt-1 text-sm text-slate-600">{description}</p>}</div>{action}</div>
}
export function AdminAlert({ message }: { message: string }) { return message ? <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</p> : null }
export const primaryButton = 'inline-flex min-h-11 items-center justify-center rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50'
export const secondaryButton = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50'
export const inputClass = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900'
