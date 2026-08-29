import { redirect } from 'next/navigation'
import { getUserRole, homeFor } from '@/lib/auth'

export default async function Home() {
  const user = await getUserRole()
  if (!user) redirect('/login')
  redirect(homeFor(user.role))
}
