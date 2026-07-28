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
    // Slice 2: signs pass QR payloads and download URLs. The pass page
    // degrades to a setup notice when absent.
    QR_SIGNING_SECRET: z.string().min(32).optional(),
    // Slice 2: Apple Wallet signing. Optional until Mark's Apple Developer
    // account exists; the download route returns 503 naming missing vars.
    APPLE_WWDR_CERT_B64: z.string().min(1).optional(),
    APPLE_PASS_CERT_P12_B64: z.string().min(1).optional(),
    APPLE_PASS_CERT_PASSWORD: z.string().min(1).optional(),
    APPLE_PASS_TYPE_ID: z.string().min(1).optional(),
    APPLE_TEAM_ID: z.string().min(1).optional(),
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
