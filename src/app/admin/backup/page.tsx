import { AdminHeading, primaryButton, secondaryButton } from '@/components/admin/shell'

export default function BackupPage() {
  return <>
    <AdminHeading title="バックアップ" description="現在の登録データをファイルとして保存します。" />
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold">データと写真</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">備品、セット内容、写真情報、部員、カテゴリ、保管場所、全移動履歴をJSONで保存します。削除済み備品と写真ファイルも含まれます。</p>
        <a href="/api/admin/backup" className={`${primaryButton} mt-5`} download>バックアップをダウンロード</a>
        <p className="mt-3 text-xs text-slate-500">写真が多い場合、ダウンロードに時間がかかります。保存後はZIPを開けることを確認してください。</p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold">備品一覧のCSV</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">表計算ソフトで確認できる備品データです。削除済み備品も含みます。復元にはZIP内のJSONを使用してください。</p>
        <a href="/api/admin/backup/equipments.csv" className={`${secondaryButton} mt-5`} download>備品CSVをダウンロード</a>
      </section>
    </div>
  </>
}
