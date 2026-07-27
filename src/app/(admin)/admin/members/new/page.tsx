import { requireAdmin } from '@/lib/auth'
import { createMember, suggestNextMemberNumber } from '../actions'
import { MemberForm } from '@/components/member-form'

export default async function NewMemberPage() {
  await requireAdmin()
  const suggestedNumber = await suggestNextMemberNumber()

  return (
    <div>
      <h1 className="text-2xl font-semibold">Add member</h1>
      <p className="mt-1 text-sm text-vcdc-cog">
        The member number is a suggestion. If this person already has a number
        in the club&apos;s existing records, enter that instead.
      </p>
      <div className="mt-6">
        <MemberForm
          action={createMember}
          defaults={{ memberNumber: suggestedNumber }}
          submitLabel="Add member"
        />
      </div>
    </div>
  )
}
