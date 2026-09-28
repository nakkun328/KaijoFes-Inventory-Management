'use client'
import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminAlert, AdminHeading, inputClass, primaryButton, secondaryButton } from './shell'
import { adminRequest, errorMessage, type AdminCategory, type AdminEquipment, type AdminLocation, type AdminMember } from './api'

type ReferenceLists = { categories: AdminCategory[]; locations: AdminLocation[]; members: AdminMember[] }
export function EquipmentForm({ equipment }: { equipment?: AdminEquipment }) {
  const router = useRouter()
  const [refs, setRefs] = useState<ReferenceLists | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState(equipment?.name ?? '')
  const [description, setDescription] = useState(equipment?.description ?? '')
  const [categoryId, setCategoryId] = useState(equipment?.category_id ?? '')
  const [defaultLocationId, setDefaultLocationId] = useState(equipment?.default_location_id ?? '')
  const [holderType, setHolderType] = useState<'member' | 'location'>(equipment?.current_member_id ? 'member' : 'location')
  const [holderId, setHolderId] = useState(equipment?.current_member_id ?? equipment?.current_location_id ?? '')
  const [status, setStatus] = useState<AdminEquipment['status']>(equipment?.status ?? 'stored')
  useEffect(() => {
    let active = true
    Promise.all([
      adminRequest<{ items: AdminCategory[] }>('/api/admin/categories'),
      adminRequest<{ items: AdminLocation[] }>('/api/admin/locations'),
      adminRequest<{ items: AdminMember[] }>('/api/admin/members'),
    ]).then(([categories, locations, members]) => { if (active) setRefs({ categories: categories.items, locations: locations.items, members: members.items }) })
      .catch((cause) => { if (active) setError(errorMessage(cause)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      const body = equipment ? { name: name.trim(), description: description.trim() || null,
        category_id: categoryId, default_location_id: defaultLocationId || null, status }
        : { name: name.trim(), description: description.trim() || null, category_id: categoryId,
          default_location_id: defaultLocationId || null, current_member_id: holderType === 'member' ? holderId : null,
          current_location_id: holderType === 'location' ? holderId : null, status }
      await adminRequest(equipment ? `/api/admin/equipments/${equipment.id}` : '/api/admin/equipments',
        { method: equipment ? 'PATCH' : 'POST', body: JSON.stringify(body) })
      router.push('/admin/equipments')
    } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  if (loading) return <p role="status">選択肢を読み込み中…</p>
  if (!refs) return <><AdminAlert message={error} /><button onClick={() => location.reload()} className={secondaryButton}>再試行</button></>
  const destinations = holderType === 'member' ? refs.members.filter((member) => member.active) : refs.locations.filter((location) => location.active)
  return <><AdminHeading title={equipment ? '備品を編集' : '備品を追加'} description={equipment ? `${equipment.management_number}・現在位置の変更は一般画面の「移動する」から記録してください。` : '管理番号は自動で発行されます。'} />
    <form onSubmit={submit} className="max-w-2xl space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <AdminAlert message={error} />
      <div><label htmlFor="name" className="mb-1 block text-sm font-semibold">備品名 *</label><input id="name" required maxLength={150} className={inputClass} value={name} onChange={(event) => setName(event.target.value)} /></div>
      <div><label htmlFor="category" className="mb-1 block text-sm font-semibold">カテゴリ *</label><select id="category" required className={inputClass} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">選択してください</option>{refs.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
      <div><label htmlFor="default-location" className="mb-1 block text-sm font-semibold">通常保管場所</label><select id="default-location" className={inputClass} value={defaultLocationId} onChange={(event) => setDefaultLocationId(event.target.value)}><option value="">未設定</option>{refs.locations.map((location) => <option key={location.id} value={location.id}>{location.name}{!location.active ? '（無効）' : ''}</option>)}</select></div>
      {!equipment && <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="holder-type" className="mb-1 block text-sm font-semibold">初期現在地の種類 *</label><select id="holder-type" className={inputClass} value={holderType} onChange={(event) => { setHolderType(event.target.value as 'member' | 'location'); setHolderId(''); setStatus(event.target.value === 'member' ? 'borrowed' : 'stored') }}><option value="location">保管場所</option><option value="member">部員</option></select></div>
        <div><label htmlFor="holder" className="mb-1 block text-sm font-semibold">初期現在地 *</label><select id="holder" required className={inputClass} value={holderId} onChange={(event) => setHolderId(event.target.value)}><option value="">選択してください</option>{destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}</select></div></div>}
      <div><label htmlFor="status" className="mb-1 block text-sm font-semibold">状態 *</label><select id="status" className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as AdminEquipment['status'])}>
        <option value={holderType === 'member' ? 'borrowed' : 'stored'}>{holderType === 'member' ? '貸出中' : '保管中'}</option><option value="broken">故障中</option><option value="lost">紛失</option>
      </select><p className="mt-1 text-xs text-slate-600">移動すると保管中・貸出中へ自動で変更されます。</p></div>
      <div><label htmlFor="description" className="mb-1 block text-sm font-semibold">備考</label><textarea id="description" rows={4} maxLength={2000} className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
      <div className="flex flex-wrap gap-2"><button disabled={busy} className={primaryButton}>{busy ? '保存中…' : '保存する'}</button><button type="button" onClick={() => router.push('/admin/equipments')} className={secondaryButton}>戻る</button></div>
    </form>
  </>
}
