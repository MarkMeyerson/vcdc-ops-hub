import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Server-only Drizzle client over the pooled Supabase connection.
// This connection is NOT subject to RLS, so every call site must sit behind
// requireAdmin() or an equivalent guard. The browser path (anon key) is the
// one RLS protects.
// POSTGRES_URL is the pooled string the Supabase-Vercel integration syncs
// automatically; DATABASE_URL is the manual override and wins when both are
// set. The driver never connects at import time (so builds pass without
// env), which also means a missing var can only surface on the first query.
// The fallback hostname exists to make that failure name the actual problem
// instead of the driver's silent localhost:5432 default.
const connectionString =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  'postgresql://missing:missing@database-url-env-var-missing.invalid:6543/missing'

// prepare: false is required with Supabase's transaction-mode pooler.
const queryClient = postgres(connectionString, { prepare: false })

export const db = drizzle(queryClient, { schema })
