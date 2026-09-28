'use client'
import { useEffect, useState } from 'react'
import type { Catalog } from '@/lib/types'

export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  async function reload() {
    setLoading(true)
    try {
      const response = await fetch('/api/catalog', { cache: 'no-store' })
      if (!response.ok) throw new Error()
      setCatalog(await response.json())
      setError('')
    } catch { setError('備品を読み込めませんでした。再読み込みしてください。') }
    finally { setLoading(false) }
  }
  useEffect(() => {
    let active = true
    fetch('/api/catalog', { cache: 'no-store' })
      .then((response) => { if (!response.ok) throw new Error(); return response.json() })
      .then((data: Catalog) => { if (active) { setCatalog(data); setError(''); setLoading(false) } })
      .catch(() => { if (active) { setError('備品を読み込めませんでした。再読み込みしてください。'); setLoading(false) } })
    return () => { active = false }
  }, [])
  return { catalog, error, loading, reload }
}
