'use server'

import { randomBytes } from 'node:crypto'
import { headers } from 'next/headers'
import { and, eq, sql } from 'drizzle-orm'
import QRCode from 'qrcode'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { guestWaivers, members } from '@/lib/db/schema'
import { currentWaiver } from '@/lib/waiver/queries'

// Signing the waiver. This is the only unauthenticated write in the app, so
// it is deliberately narrow: it can create a guest waiver and it can stamp a
// waiver date onto a member who proved they are that member. It cannot read
// the roster, cannot list waivers, and cannot change anything else.
//
// guest_waivers holds emergency contacts and signature geometry and is never
// publicly readable (migration 0002). The confirmation screen is built from
// this action's own return value, not from a later read.

// How long a guest waiver is good for. A year rather than a single ride:
// the same people come back, and making a regular hanger-on re-sign at every
// meetup is how a leader ends up waving them through unsigned.
const GUEST_WAIVER_DAYS = 365

const schema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name'),
  lastName: z.string().trim().min(1, 'Enter your last name'),
  email: z.string().trim().pipe(z.email('Enter a valid email address')),
  phone: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v)),
  emergencyContactName: z
    .string()
    .trim()
    .min(1, 'Enter an emergency contact name'),
  emergencyContactPhone: z
    .string()
    .trim()
    .min(1, 'Enter an emergency contact phone number'),
  memberNumber: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v === null || /^\d{1,9}$/.test(v), {
      message: 'A member number is digits only. Leave it blank if you are a guest.',
    }),
  guardianName: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v)),
  signatureName: z.string().trim().min(1, 'Type your name to sign'),
  signatureStrokes: z.string().trim(),
  photoConsent: z.string().nullable(),
  agreed: z.string().nullable(),
})

export type WaiverState =
  | { status: 'idle'; error: null }
  | { status: 'error'; error: string }
  | {
      status: 'member'
      error: null
      firstName: string
      memberNumber: number
    }
  | {
      status: 'guest'
      error: null
      firstName: string
      guestNumber: number
      qrDataUrl: string
      expiresAt: string
    }

function parseStrokes(raw: string): unknown | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value) || value.length === 0) return null
    // Cap the stored geometry. A pen held down for a minute produces
    // thousands of points and none of them add evidence.
    return value.slice(0, 400)
  } catch {
    return null
  }
}

export async function signWaiver(
  _prev: WaiverState,
  formData: FormData
): Promise<WaiverState> {
  const waiver = await currentWaiver()
  if (!waiver) {
    return {
      status: 'error',
      error:
        'The club has not published its waiver text yet. Tell a ride leader; nothing can be signed until it is loaded.',
    }
  }

  const parsed = schema.safeParse({
    firstName: formData.get('firstName') ?? '',
    lastName: formData.get('lastName') ?? '',
    email: formData.get('email') ?? '',
    phone: formData.get('phone') ?? '',
    emergencyContactName: formData.get('emergencyContactName') ?? '',
    emergencyContactPhone: formData.get('emergencyContactPhone') ?? '',
    memberNumber: formData.get('memberNumber') ?? '',
    guardianName: formData.get('guardianName') ?? '',
    signatureName: formData.get('signatureName') ?? '',
    signatureStrokes: formData.get('signatureStrokes') ?? '',
    photoConsent: formData.get('photoConsent'),
    agreed: formData.get('agreed'),
  })

  if (!parsed.success) {
    return {
      status: 'error',
      error: parsed.error.issues[0]?.message ?? 'Check the form',
    }
  }

  if (!parsed.data.agreed) {
    return {
      status: 'error',
      error: 'Tick the box to confirm you have read and accept the waiver.',
    }
  }

  const strokes = parseStrokes(parsed.data.signatureStrokes)

  const headerList = await headers()
  // Vercel puts the real client address first in x-forwarded-for. A missing
  // or unparseable value is stored as null rather than as a wrong address.
  const forwarded = headerList.get('x-forwarded-for')?.split(',')[0]?.trim()
  const signedIp = forwarded && forwarded.length <= 45 ? forwarded : null
  const userAgent = headerList.get('user-agent')?.slice(0, 500) ?? null

  // ---- Member path ----
  //
  // A member number plus the surname on that number. Not strong identity
  // proof, and it is not asked to be: it decides which of two records a
  // signature lands on, and both records are the same person signing the
  // same text. Anything stronger would mean a login, and members do not
  // have accounts.
  if (parsed.data.memberNumber) {
    const memberNumber = Number(parsed.data.memberNumber)
    const [member] = await db
      .select({ id: members.id, firstName: members.firstName })
      .from(members)
      .where(
        and(
          eq(members.memberNumber, memberNumber),
          sql`lower(${members.lastName}) = ${parsed.data.lastName.toLowerCase()}`
        )
      )
      .limit(1)

    if (!member) {
      return {
        status: 'error',
        error:
          'That member number and surname do not match a record. Check them, or leave the member number blank to sign as a guest.',
      }
    }

    await db
      .update(members)
      .set({
        waiverSignedAt: new Date(),
        waiverVersion: waiver.version,
        // Sign-up is also the club's best chance at a current address.
        ...(parsed.data.email ? { email: parsed.data.email } : {}),
        ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
        updatedAt: new Date(),
      })
      .where(eq(members.id, member.id))
      .catch(async () => {
        // An address already on another member would break the unique index
        // and lose the signature with it. The waiver matters more than the
        // address, so the stamp goes on without it.
        await db
          .update(members)
          .set({
            waiverSignedAt: new Date(),
            waiverVersion: waiver.version,
            updatedAt: new Date(),
          })
          .where(eq(members.id, member.id))
      })

    return {
      status: 'member',
      error: null,
      firstName: member.firstName,
      memberNumber,
    }
  }

  // ---- Guest path ----

  const qrToken = randomBytes(24).toString('base64url')
  const expiresAt = new Date(
    Date.now() + GUEST_WAIVER_DAYS * 24 * 60 * 60 * 1000
  )

  const [created] = await db
    .insert(guestWaivers)
    .values({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      emergencyContactName: parsed.data.emergencyContactName,
      emergencyContactPhone: parsed.data.emergencyContactPhone,
      signatureStrokes: strokes,
      signatureName: parsed.data.signatureName,
      guardianName: parsed.data.guardianName,
      photoConsent: parsed.data.photoConsent !== null,
      waiverTextVersion: waiver.version,
      signedIp,
      userAgent,
      qrToken,
      expiresAt,
    })
    .returning({
      guestNumber: guestWaivers.guestNumber,
    })

  if (!created) {
    return {
      status: 'error',
      error: 'Could not save the waiver. Try again, or ask a ride leader.',
    }
  }

  const payload = `vcdc:g:${created.guestNumber}:${qrToken}`
  const qrDataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
  })

  return {
    status: 'guest',
    error: null,
    firstName: parsed.data.firstName,
    guestNumber: created.guestNumber,
    qrDataUrl,
    expiresAt: expiresAt.toISOString(),
  }
}
