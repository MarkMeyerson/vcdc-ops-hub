'use client'

// Last line of defence on the member-facing card pages. Everything under
// /card is opened by members from an email, with no account and no way to
// ask anybody what went wrong, so a database blip or an unhandled edge must
// not surface as a stack trace.
//
// The guidance below deliberately does not depend on the failure: whatever
// broke, trying the link again later and asking the club are the only two
// things a member can actually do.

export default function CardError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-vcdc-sky/20 p-4">
      <div className="w-full max-w-sm rounded-lg border border-vcdc-cog/30 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-vcdc-cog">
          This is our problem, not yours, and your link is still good. Try
          again in a moment.
        </p>
        <button
          onClick={reset}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-vcdc-amber px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-vcdc-amber/90"
        >
          Try again
        </button>
        <p className="mt-6 border-t border-vcdc-cog/20 pt-4 text-xs text-vcdc-cog">
          If it keeps happening, tell the club and we will send your card
          another way.
        </p>
      </div>
    </main>
  )
}
