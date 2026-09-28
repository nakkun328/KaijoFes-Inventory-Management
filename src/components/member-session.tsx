'use client'
import { useSyncExternalStore } from 'react'
import type { Named } from '@/lib/types'

const key = 'kaijofes_member_id'
const changeEvent = 'kaijofes_member_changed'
function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(changeEvent, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(changeEvent, onChange)
  }
}
function snapshot() { return localStorage.getItem(key) }
function serverSnapshot() { return null }

export function useMemberSession(members: Named[]) {
  const memberId = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const ready = typeof window !== 'undefined'
  const member = members.find((item) => item.id === memberId) || null
  function select(id: string) { localStorage.setItem(key, id); window.dispatchEvent(new Event(changeEvent)) }
  function clear() { localStorage.removeItem(key); window.dispatchEvent(new Event(changeEvent)) }
  return { member, ready, select, clear }
}

export function MemberPicker({ members, onSelect }: { members: Named[]; onSelect: (id: string) => void }) {
  return <main className="mx-auto max-w-lg px-5 py-12">
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <p className="text-sm font-bold text-teal-700">広報部 備品管理</p>
      <h1 className="mt-3 text-2xl font-bold">あなたは誰ですか？</h1>
      <p className="mt-2 text-sm text-slate-600">自分の名前を選んでください。この端末に保存されます。</p>
      {members.length === 0 && <p className="mt-6 text-slate-600">利用できる部員が登録されていません。</p>}
      <div className="mt-6 grid gap-3">
        {members.map((member) => <button key={member.id} onClick={() => onSelect(member.id)}
          className="min-h-14 rounded-xl border border-slate-200 bg-slate-50 px-4 text-left text-lg font-semibold hover:bg-teal-50 active:bg-teal-100">
          {member.name}
        </button>)}
      </div>
    </div>
  </main>
}
