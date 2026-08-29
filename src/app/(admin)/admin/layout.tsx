import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { SignOutButton } from '@/components/sign-out-button'

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdmin()

  return (
    <div className="min-h-screen">
      <header className="border-b border-vcdc-cog/30 bg-vcdc-charcoal text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-semibold">
              VCDC Operations Hub
            </Link>
            <nav className="flex gap-4 text-sm text-white/80">
              <Link href="/admin/members" className="hover:text-white">
                Members
              </Link>
              <Link href="/admin/members/review" className="hover:text-white">
                Review
              </Link>
              <Link href="/admin/members/links" className="hover:text-white">
                Card links
              </Link>
              <Link href="/admin/leaders" className="hover:text-white">
                Leaders
              </Link>
              <Link href="/admin/waiver" className="hover:text-white">
                Waiver
              </Link>
              <Link href="/ride" className="hover:text-white">
                Rides
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/70">
            <span>{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  )
}
