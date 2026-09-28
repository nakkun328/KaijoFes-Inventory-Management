import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '広報部 備品管理',
  description: '文化祭実行委員会 広報部の備品管理',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>
}
