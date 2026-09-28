'use client'
import { use, useEffect, useState } from 'react'
import { EquipmentForm } from '@/components/admin/equipment-form'
import { AdminAlert } from '@/components/admin/shell'
import { adminRequest, errorMessage, type AdminEquipment } from '@/components/admin/api'
export default function EditEquipment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [equipment, setEquipment] = useState<AdminEquipment | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    adminRequest<{ item: AdminEquipment }>(`/api/admin/equipments/${id}`).then(({ item }) => { if (active) setEquipment(item) })
      .catch((cause) => { if (active) setError(errorMessage(cause)) })
    return () => { active = false }
  }, [id])
  if (error) return <AdminAlert message={error} />
  if (!equipment) return <p role="status">備品を読み込み中…</p>
  return <EquipmentForm key={equipment.id} equipment={equipment} />
}
