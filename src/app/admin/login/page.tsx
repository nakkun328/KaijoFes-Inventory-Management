'use client'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { adminRequest, errorMessage } from '@/components/admin/api'
import { AdminAlert, inputClass, primaryButton } from '@/components/admin/shell'
export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setWorking(true); setError('')
    try { await adminRequest('/api/admin/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); router.replace('/admin') }
    catch (cause) { setError(errorMessage(cause)) } finally { setWorking(false) }
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <p className="text-sm font-semibold text-teal-700">文化祭実行委員会 広報部</p><h1 className="mt-2 text-2xl font-bold">管理者ログイン</h1><p className="mt-2 text-sm text-slate-600">登録済みの管理者メールアドレスとパスワードを入力してください。</p>
    <div className="mt-6"><label htmlFor="email" className="mb-2 block text-sm font-semibold">メールアドレス</label><input id="email" type="email" autoComplete="username" required className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} /></div>
    <div className="mt-4"><label htmlFor="password" className="mb-2 block text-sm font-semibold">パスワード</label><input id="password" type="password" autoComplete="current-password" required className={inputClass} value={password} onChange={(event) => setPassword(event.target.value)} /></div>
    <div className="mt-4"><AdminAlert message={error} /></div><button disabled={working} className={`${primaryButton} w-full`}>{working ? '確認中…' : 'ログイン'}</button>
  </form></main>
}
