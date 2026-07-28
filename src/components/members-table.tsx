import Link from 'next/link'
import type { Member } from '@/lib/db/schema'
import { deleteMember } from '@/app/(admin)/admin/members/actions'
import { DeleteMemberButton } from '@/components/delete-member-button'

const tierLabels: Record<Member['membershipTier'], string> = {
  regular: 'Regular',
  lifetime: 'Lifetime',
  honorary: 'Honorary',
}

export function MembersTable({
  members,
  today,
}: {
  members: Member[]
  today: string
}) {
  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-vcdc-cog/40 p-10 text-center text-sm text-vcdc-cog">
        No members yet. Add the first one to get started.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-vcdc-cog/30">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-vcdc-cog/30 bg-vcdc-cog/10 text-xs uppercase text-vcdc-cog">
          <tr>
            <th className="px-4 py-3">Number</th>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Tier</th>
            <th className="px-4 py-3">Expires</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const active = member.expiresAt >= today
            return (
              <tr
                key={member.id}
                className="border-b border-vcdc-cog/20 last:border-0"
              >
                <td className="px-4 py-3 font-mono">{member.memberNumber}</td>
                <td className="px-4 py-3">
                  {member.firstName} {member.lastName}
                </td>
                <td className="px-4 py-3">{member.email}</td>
                <td className="px-4 py-3">{tierLabels[member.membershipTier]}</td>
                <td className="px-4 py-3">{member.expiresAt}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      active
                        ? 'rounded-full bg-vcdc-green/10 px-2 py-1 text-xs font-medium text-vcdc-green'
                        : 'rounded-full bg-vcdc-red/10 px-2 py-1 text-xs font-medium text-vcdc-red'
                    }
                  >
                    {active ? 'Active' : 'Expired'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/admin/members/${member.id}/pass`}
                      className="font-medium text-vcdc-amber hover:underline"
                    >
                      Pass
                    </Link>
                    <Link
                      href={`/admin/members/${member.id}/edit`}
                      className="font-medium text-vcdc-amber hover:underline"
                    >
                      Edit
                    </Link>
                    <DeleteMemberButton
                      action={deleteMember.bind(null, member.id)}
                      memberName={`${member.firstName} ${member.lastName}`}
                    />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
