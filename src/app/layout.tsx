import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VCDC Operations Hub',
  description: 'Ride sign-in and membership for the Vespa Club of D.C.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
