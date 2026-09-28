import { NextResponse } from 'next/server'
import { getCatalog } from '@/lib/catalog'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await getCatalog(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Catalog read failed', error)
    return NextResponse.json({ error: '備品を読み込めませんでした。' }, { status: 500 })
  }
}
