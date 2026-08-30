import {
  boolean,
  date,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

// Drizzle mirror of supabase/migrations/. The SQL migrations are
// the source of truth; keep the two in sync when the schema changes.

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberNumber: integer('member_number').unique().notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    // Nullable: most of the imported roster has no address on file yet.
    email: text('email').unique(),
    phone: text('phone'),
    membershipTier: text('membership_tier', {
      enum: ['regular', 'lifetime', 'honorary'],
    })
      .notNull()
      .default('regular'),
    joinedAt: date('joined_at').notNull(),
    expiresAt: date('expires_at').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Null until they sign. The imported roster has signed nothing in this
    // system, and a leader must see that rather than a green check.
    waiverSignedAt: timestamp('waiver_signed_at', { withTimezone: true }),
    waiverVersion: integer('waiver_version'),
  },
  (table) => [
    index('members_member_number_idx').on(table.memberNumber),
    index('members_expires_at_idx').on(table.expiresAt),
  ]
)

export const rideLeaders = pgTable('ride_leaders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  email: text('email').unique().notNull(),
  fullName: text('full_name').notNull(),
  memberId: uuid('member_id').references(() => members.id, {
    onDelete: 'set null',
  }),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const waiverVersions = pgTable('waiver_versions', {
  version: integer('version').primaryKey().generatedAlwaysAsIdentity(),
  bodyMarkdown: text('body_markdown').notNull(),
  effectiveFrom: timestamp('effective_from', { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid('created_by'),
})

export const guestWaivers = pgTable(
  'guest_waivers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guestNumber: integer('guest_number').generatedAlwaysAsIdentity(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    emergencyContactName: text('emergency_contact_name'),
    emergencyContactPhone: text('emergency_contact_phone'),
    // Storage path for a rendered PNG, when there is one. The stroke
    // geometry below is what is always written; see migration 0004.
    signaturePath: text('signature_path'),
    signatureStrokes: jsonb('signature_strokes'),
    signatureName: text('signature_name'),
    guardianName: text('guardian_name'),
    photoConsent: boolean('photo_consent').notNull().default(true),
    waiverTextVersion: integer('waiver_text_version')
      .notNull()
      .references(() => waiverVersions.version),
    signedAt: timestamp('signed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    signedIp: inet('signed_ip'),
    userAgent: text('user_agent'),
    qrToken: text('qr_token').unique().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('guest_waivers_qr_token_idx').on(table.qrToken)]
)

export const rides = pgTable(
  'rides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rideLeaderId: uuid('ride_leader_id')
      .notNull()
      .references(() => rideLeaders.id),
    rideDate: date('ride_date').notNull(),
    routeName: text('route_name').notNull(),
    startLocation: text('start_location'),
    notes: text('notes'),
    status: text('status', { enum: ['planned', 'active', 'submitted'] })
      .notNull()
      .default('planned'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('rides_leader_date_idx').on(table.rideLeaderId, table.rideDate)]
)

export const rideAttendance = pgTable(
  'ride_attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').references(() => members.id),
    guestWaiverId: uuid('guest_waiver_id').references(() => guestWaivers.id),
    scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull(),
    scannedOffline: boolean('scanned_offline').notNull().default(false),
    // A scan the server could not resolve to a person. Kept rather than
    // dropped, so submitting a ride can never lose somebody the leader
    // stood in front of.
    rawCode: text('raw_code'),
    unresolvedReason: text('unresolved_reason'),
  },
  (table) => [
    index('ride_attendance_ride_id_idx').on(table.rideId),
    unique().on(table.rideId, table.memberId),
    unique().on(table.rideId, table.guestWaiverId),
  ]
)

export const rideComments = pgTable(
  'ride_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    rideLeaderId: uuid('ride_leader_id')
      .notNull()
      .references(() => rideLeaders.id),
    comment: text('comment').notNull(),
    kind: text('kind', { enum: ['note', 'finish'] })
      .notNull()
      .default('note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('ride_comments_ride_id_idx').on(table.rideId)]
)

export const appFeedback = pgTable('app_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  rideLeaderId: uuid('ride_leader_id')
    .notNull()
    .references(() => rideLeaders.id),
  // Where they were standing when they hit the button, e.g. "/ride/abc/scan".
  // Captured automatically so nobody has to describe which screen they mean.
  path: text('path').notNull(),
  message: text('message').notNull(),
  type: text('type', {
    enum: ['bug', 'confusing', 'idea', 'question', 'other'],
  })
    .notNull()
    .default('other'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const appSettings = pgTable('app_settings', {
  id: boolean('id').primaryKey().default(true),
  rosterRecipientEmails: text('roster_recipient_emails')
    .array()
    .notNull()
    .default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type Member = typeof members.$inferSelect
export type NewMember = typeof members.$inferInsert
export type RideLeader = typeof rideLeaders.$inferSelect
export type Ride = typeof rides.$inferSelect
export type NewRide = typeof rides.$inferInsert
export type GuestWaiver = typeof guestWaivers.$inferSelect
export type WaiverVersion = typeof waiverVersions.$inferSelect
export type RideComment = typeof rideComments.$inferSelect
export type AppFeedback = typeof appFeedback.$inferSelect
