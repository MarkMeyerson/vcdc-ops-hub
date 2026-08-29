import { requireAdmin } from '@/lib/auth'
import { adminAuthConfigured } from '@/lib/supabase/admin'
import { listLeaders } from './actions'
import { LeaderForm } from '@/components/leader-form'
import { LeaderActiveToggle } from '@/components/leader-active-toggle'

// Who can run a ride. Adding somebody here is the whole of onboarding: it
// creates their sign-in account and their roster entry together, and they
// are then one magic link away from scanning cards.

export const dynamic = 'force-dynamic'

export default async function LeadersPage() {
  await requireAdmin()
  const status = adminAuthConfigured()
  const leaders = status.configured ? await listLeaders() : []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Ride leaders</h1>
        <p className="mt-1 text-sm text-vcdc-cog">
          Adding a leader creates their sign-in account and grants the ride
          leader role. They sign in with a magic link at the login page; there
          is no password to send them.
        </p>
      </div>

      {!status.configured ? (
        <div className="rounded-lg border-2 border-vcdc-red bg-vcdc-red/10 p-4 text-sm">
          <p className="font-medium">Cannot create accounts from here yet.</p>
          <p className="mt-1">
            Missing: {status.missing.join(', ')}. Set them in Vercel and
            redeploy. Nothing else on this page works without them, because
            granting a role means writing app_metadata, which only the service
            role key can do.
          </p>
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-vcdc-cog/30 p-4">
            <h2 className="text-sm font-medium uppercase text-vcdc-cog">
              Add a leader
            </h2>
            <div className="mt-3">
              <LeaderForm />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium uppercase text-vcdc-cog">
              Current ({leaders.length})
            </h2>
            {leaders.length === 0 ? (
              <p className="mt-2 text-sm text-vcdc-cog">
                Nobody yet. Add the first one above.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-vcdc-cog/20 rounded-lg border border-vcdc-cog/30">
                {leaders.map((leader) => (
                  <li key={leader.id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">
                        {leader.fullName}
                        {!leader.active && (
                          <span className="ml-2 text-xs text-vcdc-cog">
                            deactivated
                          </span>
                        )}
                      </span>
                      <LeaderActiveToggle
                        leaderId={leader.id}
                        active={leader.active}
                      />
                    </div>
                    <p className="text-sm text-vcdc-cog">{leader.email}</p>
                    <p className="mt-1 text-xs text-vcdc-cog">
                      {leader.memberNumber
                        ? `Member ${leader.memberNumber}`
                        : 'Not a member'}
                      {' · '}
                      {leader.rideCount} ride
                      {leader.rideCount === 1 ? '' : 's'}
                      {' · '}
                      {leader.linked
                        ? 'account linked'
                        : 'has not signed in yet'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
