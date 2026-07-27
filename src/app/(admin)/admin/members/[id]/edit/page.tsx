import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth'
import { updateMember } from '../../actions'
import { MemberForm } from '@/components/member-form'

// Next.js 16: params is a Promise and must be awaited.
export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params

  const [member] = await db.select().from(members).where(eq(members.id, id))
  if (!member) notFound()

  return (
    <div>
      <h1 className="text-2xl font-semibold">
        Edit member {member.memberNumber}
      </h1>
      <div className="mt-6">
        <MemberForm
          action={updateMember.bind(null, member.id)}
          defaults={member}
          submitLabel="Save changes"
        />
      </div>
    </div>
  )
}
