import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Server-only Drizzle client over the pooled Supabase connection.
// This connection is NOT subject to RLS, so every call site must sit behind
// requireAdmin() or an equivalent guard. The browser path (anon key) is the
// one RLS protects.
// prepare: false is required with Supabase's transaction-mode pooler.
const queryClient = postgres(process.env.DATABASE_URL!, { prepare: false })

export const db = drizzle(queryClient, { schema })
