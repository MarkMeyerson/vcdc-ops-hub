import { defineConfig } from 'drizzle-kit'

// Migrations are hand-written SQL in supabase/migrations (run in the Supabase
// SQL editor or via the Supabase CLI). Drizzle is the query client only, so
// this config exists for drizzle-kit introspection and studio, not codegen.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './supabase/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '',
  },
})
