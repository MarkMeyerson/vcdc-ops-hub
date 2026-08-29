'use client'

import { useActionState, useState } from 'react'
import {
  publishWaiver,
  type PublishState,
} from '@/app/(admin)/admin/waiver/actions'
import { Button } from '@/components/ui/button'

export function WaiverPublishForm({
  current,
  starter,
}: {
  current: string
  starter: string
}) {
  const [state, action, pending] = useActionState<PublishState, FormData>(
    publishWaiver,
    { error: null, version: null }
  )
  const [text, setText] = useState(current)

  return (
    <form action={action} className="space-y-3">
      <textarea
        name="bodyMarkdown"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={22}
        className="block w-full rounded-md border border-vcdc-cog/40 p-3 font-mono text-xs focus:border-vcdc-amber focus:outline-none focus:ring-1 focus:ring-vcdc-amber"
      />
      <p className="text-xs text-vcdc-cog">
        Markdown: # for a title, ## and ### for sections, - for bullets, **bold**.
        Anything else appears as the literal characters you typed. HTML is
        escaped, never rendered.
      </p>
      {state.error && <p className="text-sm text-vcdc-red">{state.error}</p>}
      {state.version && (
        <p className="rounded-md bg-vcdc-green/10 p-3 text-sm">
          Published as version {state.version}. Everyone who signs from now on
          signs this text; earlier versions are untouched.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Publishing...' : 'Publish as a new version'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setText(starter)}
        >
          Load the starter text
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setText(current)}
        >
          Reset
        </Button>
      </div>
    </form>
  )
}
