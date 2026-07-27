import { redirect } from 'next/navigation'
import { getUserRole } from '@/lib/auth'

export default async function Home() {
  const user = await getUserRole()
  if (user?.role === 'admin') redirect('/admin')
  redirect('/login')
}
