import Link from 'next/link'
import { AdminHeading } from '@/components/admin/shell'
export default function AdminDashboard() {
  const sections = [
    { href: '/admin/equipments', title: '備品管理', description: '備品の登録・編集・削除' },
    { href: '/admin/history', title: '移動履歴', description: '全履歴の検索と絞り込み' },
    { href: '/admin/members', title: '部員管理', description: '部員の追加と無効化' },
    { href: '/admin/categories', title: 'カテゴリ管理', description: 'カテゴリの追加と編集' },
    { href: '/admin/locations', title: '保管場所管理', description: '保管場所の追加と無効化' },
    { href: '/admin/equipments/deleted', title: '削除済み備品', description: '削除済み備品の確認と復元' },
    { href: '/admin/backup', title: 'バックアップ', description: 'データと写真をZIPで保存' },
  ]
  return <><AdminHeading title="ダッシュボード" description="管理する内容を選択してください。" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{sections.map((section) => <Link key={section.href} href={section.href} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-teal-500 hover:bg-teal-50"><h2 className="font-bold">{section.title} →</h2><p className="mt-2 text-sm text-slate-600">{section.description}</p></Link>)}</div>
  </>
}
