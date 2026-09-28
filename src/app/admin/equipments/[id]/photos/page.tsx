'use client'
import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { adminRequest, errorMessage, type AdminEquipment } from '@/components/admin/api'
import { PhotoManager } from '@/components/admin/photo-manager'
import { AdminAlert, AdminHeading, secondaryButton } from '@/components/admin/shell'

export default function EquipmentPhotos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [equipment, setEquipment] = useState<AdminEquipment | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    adminRequest<{ item: AdminEquipment }>(`/api/admin/equipments/${id}`)
      .then(({ item }) => { if (active) setEquipment(item) })
      .catch((cause) => { if (active) setError(errorMessage(cause)) })
    return () => { active = false }
  }, [id])
  if (error) return <AdminAlert message={error} />
  if (!equipment) return <p role="status">備品を読み込み中…</p>
  return <>
    <AdminHeading title={`${equipment.name}の写真`} description={`${equipment.management_number}${equipment.deleted_at ? ' · 削除済み備品' : ''}`}
      action={<Link href={equipment.deleted_at ? '/admin/equipments/deleted' : `/admin/equipments/${id}`} className={secondaryButton}>戻る</Link>} />
    <PhotoManager equipmentId={id} deleted={Boolean(equipment.deleted_at)} />
  </>
}
