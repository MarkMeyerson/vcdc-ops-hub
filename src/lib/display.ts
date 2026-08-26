import type { Member } from '@/lib/db/schema'
import { envVar } from '@/lib/env'

// Shared display helpers. One definition each; import instead of redefining
// per component so labels and date formats never drift between the admin
// UI and the wallet pass.

export const tierLabels: Record<Member['membershipTier'], string> = {
  regular: 'Regular',
  lifetime: 'Lifetime',
  honorary: 'Honorary',
}

// Renders a date-only column (YYYY-MM-DD) like "Jul 16, 2027". Parsed as
// UTC midnight so the printed day never shifts with server timezone.
export function displayDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

// Canonical app origin for building absolute URLs. Normalizes any trailing
// slash so joins never produce "https://host//path".
export function appOrigin(): string | null {
  const url = envVar('NEXT_PUBLIC_APP_URL')
  if (!url) return null
  return url.replace(/\/+$/, '')
}
