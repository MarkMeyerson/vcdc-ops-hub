'use client'

import { useTransition } from 'react'

export function DeleteMemberButton({
  action,
  memberName,
}: {
  action: () => Promise<void>
  memberName: string
}) {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    if (!window.confirm(`Delete ${memberName}? This cannot be undone.`)) return
    startTransition(async () => {
      await action()
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="font-medium text-vcdc-red hover:underline disabled:opacity-50"
    >
      {pending ? 'Deleting...' : 'Delete'}
    </button>
  )
}
