import { NextResponse } from 'next/server'
import { getEquipment } from '@/lib/catalog'

export const dynamic = 'force-dynamic'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!uuid.test(id)) return NextResponse.json({ error: '備品が見つかりません。' }, { status: 404 })
  try {
    const data = await getEquipment(id)
    return data
      ? NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
      : NextResponse.json({ error: '備品が見つかりません。' }, { status: 404 })
  } catch (error) {
    console.error('Equipment read failed', error)
    return NextResponse.json({ error: '備品を読み込めませんでした。' }, { status: 500 })
  }
}
