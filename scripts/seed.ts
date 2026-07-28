// Seed script (brief Section 13): 1 admin, 3 ride leaders, 12 members across
// all tiers with varied expiry dates including one expired, 2 historical
// rides with attendance. Idempotent: safe to re-run.
//
// Usage: set env vars (see .env.example), then `npm run seed`.
// Requires SUPABASE_SERVICE_ROLE_KEY to create/promote the admin auth user.

import { createClient } from '@supabase/supabase-js'
import { drizzle } from 'drizzle-orm/postgres-js'
import { count, eq } from 'drizzle-orm'
import postgres from 'postgres'
import {
  members,
  rideAttendance,
  rideLeaders,
  rides,
} from '../src/lib/db/schema'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

const DATABASE_URL = requireEnv('DATABASE_URL')
const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const ADMIN_EMAIL = requireEnv('ADMIN_EMAIL')

const sql = postgres(DATABASE_URL, { prepare: false })
const db = drizzle(sql)
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const result = d.toISOString().slice(0, 10)
  if (!result) throw new Error('date formatting failed')
  return result
}

async function ensureAdminUser() {
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) throw error

  const existing = data.users.find(
    (u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  )

  if (existing) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      existing.id,
      { app_metadata: { ...existing.app_metadata, role: 'admin' } }
    )
    if (updateError) throw updateError
    console.log(`Admin role confirmed on existing user ${ADMIN_EMAIL}`)
    return
  }

  const { error: createError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    email_confirm: true,
    app_metadata: { role: 'admin' },
  })
  if (createError) throw createError
  console.log(`Created admin user ${ADMIN_EMAIL}`)
}

async function seedMembers() {
  // 12 members: 9 regular, 2 lifetime, 1 honorary. Varied expiry dates,
  // including one already expired (member 10007).
  const rows = [
    { n: 10001, first: 'Gina', last: 'Rossi', tier: 'regular', joined: -700, expires: 320 },
    { n: 10002, first: 'Paul', last: 'Okafor', tier: 'regular', joined: -650, expires: 200 },
    { n: 10003, first: 'Maria', last: 'Delgado', tier: 'lifetime', joined: -1400, expires: 36500 },
    { n: 10004, first: 'Sam', last: 'Whitfield', tier: 'regular', joined: -400, expires: 90 },
    { n: 10005, first: 'Aisha', last: 'Bell', tier: 'regular', joined: -380, expires: 45 },
    { n: 10006, first: 'Tom', last: 'Nguyen', tier: 'regular', joined: -900, expires: 150 },
    { n: 10007, first: 'Rita', last: 'Campos', tier: 'regular', joined: -800, expires: -30 },
    { n: 10008, first: 'Dave', last: 'Sherman', tier: 'lifetime', joined: -2000, expires: 36500 },
    { n: 10009, first: 'Lena', last: 'Park', tier: 'regular', joined: -250, expires: 280 },
    { n: 10010, first: 'Carlo', last: 'Bianchi', tier: 'honorary', joined: -1800, expires: 36500 },
    { n: 10011, first: 'June', last: 'Adler', tier: 'regular', joined: -100, expires: 265 },
    { n: 10012, first: 'Omar', last: 'Haddad', tier: 'regular', joined: -60, expires: 305 },
  ] as const

  for (const row of rows) {
    await db
      .insert(members)
      .values({
        memberNumber: row.n,
        firstName: row.first,
        lastName: row.last,
        email: `${row.first.toLowerCase()}.${row.last.toLowerCase()}@example.com`,
        membershipTier: row.tier,
        joinedAt: isoDate(row.joined),
        expiresAt: isoDate(row.expires),
      })
      .onConflictDoNothing()
  }
  console.log(`Seeded ${rows.length} members`)
}

async function seedRideLeadersAndRides() {
  const leaders = [
    { email: 'leader.one@example.com', name: 'Gina Rossi', memberNumber: 10001 },
    { email: 'leader.two@example.com', name: 'Dave Sherman', memberNumber: 10008 },
    { email: 'leader.three@example.com', name: 'Frank Toole', memberNumber: null },
  ]

  for (const leader of leaders) {
    let memberId: string | null = null
    if (leader.memberNumber) {
      const [m] = await db
        .select({ id: members.id })
        .from(members)
        .where(eq(members.memberNumber, leader.memberNumber))
      memberId = m?.id ?? null
    }
    await db
      .insert(rideLeaders)
      .values({ email: leader.email, fullName: leader.name, memberId })
      .onConflictDoNothing()
  }
  console.log(`Seeded ${leaders.length} ride leaders`)

  const [leadOne] = await db
    .select({ id: rideLeaders.id })
    .from(rideLeaders)
    .where(eq(rideLeaders.email, 'leader.one@example.com'))
  const [leadTwo] = await db
    .select({ id: rideLeaders.id })
    .from(rideLeaders)
    .where(eq(rideLeaders.email, 'leader.two@example.com'))
  if (!leadOne || !leadTwo) throw new Error('ride leaders missing after seed')

  const historicalRides = [
    {
      leaderId: leadOne.id,
      date: isoDate(-90),
      route: 'Rock Creek Loop',
      start: 'Meridian Hill Park',
      attendees: [10001, 10002, 10004, 10006, 10009],
    },
    {
      leaderId: leadTwo.id,
      date: isoDate(-30),
      route: 'Mount Vernon Trail Run',
      start: 'Gravelly Point',
      attendees: [10001, 10005, 10008, 10011, 10012],
    },
  ]

  for (const rideDef of historicalRides) {
    const existing = await db
      .select({ id: rides.id })
      .from(rides)
      .where(eq(rides.routeName, rideDef.route))
    if (existing.length > 0) continue

    const [ride] = await db
      .insert(rides)
      .values({
        rideLeaderId: rideDef.leaderId,
        rideDate: rideDef.date,
        routeName: rideDef.route,
        startLocation: rideDef.start,
        status: 'submitted',
        submittedAt: new Date(`${rideDef.date}T20:00:00Z`),
      })
      .returning({ id: rides.id })
    if (!ride) throw new Error('ride insert returned nothing')

    for (const memberNumber of rideDef.attendees) {
      const [m] = await db
        .select({ id: members.id })
        .from(members)
        .where(eq(members.memberNumber, memberNumber))
      if (!m) continue
      await db
        .insert(rideAttendance)
        .values({
          rideId: ride.id,
          memberId: m.id,
          scannedAt: new Date(`${rideDef.date}T14:30:00Z`),
        })
        .onConflictDoNothing()
    }
  }
  console.log('Seeded 2 historical rides with attendance')
}

async function main() {
  await ensureAdminUser()

  // Safety: never mix sample rows into a database that already holds real
  // members (this bit once being pointed at production would be bad).
  // --force overrides for a deliberate re-seed of a dev database.
  const [existing] = await db.select({ value: count() }).from(members)
  if ((existing?.value ?? 0) > 0 && !process.argv.includes('--force')) {
    console.log(
      'Members table is not empty: skipping sample data so real records stay untouched. Run with --force to add samples anyway.'
    )
  } else {
    await seedMembers()
    await seedRideLeadersAndRides()
  }

  await sql.end()
  console.log('Seed complete')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
