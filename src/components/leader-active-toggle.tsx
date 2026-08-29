'use client'

import { useTransition } from 'react'
import { setLeaderActive } from '@/app/(admin)/admin/leaders/actions'

export function LeaderActiveToggle({
  leaderId,
  active,
}: {
  leaderId: string
  active: boolean
}) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setLeaderActive(leaderId, !active)
        })
      }
      className="text-xs underline disabled:opacity-50"
    >
      {pending ? 'Saving...' : active ? 'Deactivate' : 'Reactivate'}
    </button>
  )
}
