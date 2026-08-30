'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { submitFeedback } from '@/app/feedback/actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

// A single always-there way to say something, mounted once in the ride
// layout so it rides along on every leader-facing screen. Deliberately
// small when closed (one round button, corner of the screen, out of the
// way of the scanner and the check-in list) so it never competes with the
// job at hand; the page it was opened from is captured automatically so
// nobody has to describe which screen they mean.

const TYPES: { value: 'bug' | 'confusing' | 'idea' | 'question' | 'other'; label: string }[] = [
  { value: 'bug', label: 'Something broke' },
  { value: 'confusing', label: 'Confusing' },
  { value: 'idea', label: 'Idea' },
  { value: 'question', label: 'Question' },
  { value: 'other', label: 'Other' },
]

export function FeedbackWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('other')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const reset = () => {
    setType('other')
    setMessage('')
    setError(null)
    setSent(false)
  }

  const handleSend = async () => {
    setSending(true)
    setError(null)
    try {
      const result = await submitFeedback({
        path: pathname,
        message,
        type,
        userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSent(true)
      setMessage('')
    } catch {
      setError('Could not send that. Try again once you have signal.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset()
          setOpen(true)
        }}
        aria-label="Send feedback"
        className="fixed bottom-4 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-vcdc-charcoal text-white shadow-lg hover:bg-vcdc-charcoal/90"
      >
        <span aria-hidden className="text-lg">💬</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              Bug, something confusing, an idea — whatever it is, this goes
              straight to the club, tagged with the screen you&rsquo;re on.
            </DialogDescription>
          </DialogHeader>

          {sent ? (
            <div className="space-y-3">
              <p className="text-sm text-vcdc-green">
                Sent. Thanks — this is read.
              </p>
              <Button type="button" onClick={() => setOpen(false)} className="w-full">
                Close
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      type === t.value
                        ? 'border-vcdc-amber bg-vcdc-amber/20 font-medium'
                        : 'border-vcdc-cog/40 text-vcdc-cog'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What's going on?"
                rows={4}
                autoFocus
              />
              <Button
                type="button"
                onClick={() => void handleSend()}
                disabled={sending || !message.trim()}
                className="w-full"
              >
                {sending ? 'Sending...' : 'Send'}
              </Button>
              {error && <p className="text-sm text-vcdc-red">{error}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
