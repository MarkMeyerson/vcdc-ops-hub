import { z } from 'zod'

// Fail-fast env validation (brief Section 10). Only variables the current
// slice actually uses are required; later slices extend this schema when
// their features land. A missing var fails the build/boot by name instead
// of surfacing as a confusing runtime error.
const schema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    // Either the manual DATABASE_URL or the Supabase-Vercel integration's
    // synced POSTGRES_URL must be present (client.ts prefers DATABASE_URL).
    DATABASE_URL: z.string().min(1).optional(),
    POSTGRES_URL: z.string().min(1).optional(),
    NEXT_PUBLIC_APP_URL: z.string().url(),
    ADMIN_EMAIL: z.string().email(),
  })
  .refine((vars) => vars.DATABASE_URL || vars.POSTGRES_URL, {
    message: 'DATABASE_URL (or POSTGRES_URL)',
    path: ['DATABASE_URL'],
  })

function validate() {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => issue.path.join('.'))
      .join(', ')
    throw new Error(`Invalid or missing environment variables: ${missing}`)
  }
  return parsed.data
}

export const env = validate()
