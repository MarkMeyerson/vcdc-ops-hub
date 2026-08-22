import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'
import type { Member } from '@/lib/db/schema'
import { displayDate, tierLabels } from '@/lib/display'
import { buildMemberQrPayload, qrSigningConfigured } from '@/lib/qr/payload'

// Printable membership card, the interim credential for iPhone members
// while the club's Apple Developer enrollment is pending. It carries the
// same signed QR payload as both wallet passes, so a ride leader scan
// resolves to the same member whichever one a rider shows.
//
// Page size is 4 by 6 inches: it fills a phone screen when opened from an
// email, and prints on a home printer without scaling surprises. Everything
// is generated in memory, nothing touches disk (Vercel has no writable
// filesystem).

const PAGE_WIDTH = 288
const PAGE_HEIGHT = 432
const MARGIN = 24

const SKY_BLUE = rgb(0x89 / 255, 0xcb / 255, 0xe5 / 255)
const CHARCOAL = rgb(0x2b / 255, 0x2d / 255, 0x2e / 255)
const WHITE = rgb(1, 1, 1)

export function memberCardStatus(): { configured: boolean; missing: string[] } {
  const missing = qrSigningConfigured() ? [] : ['QR_SIGNING_SECRET']
  return { configured: missing.length === 0, missing }
}

export function memberCardFilename(member: Member): string {
  // The surname is what makes this findable once it is sitting in a phone's
  // downloads folder next to everything else. Punctuation and accents are
  // stripped so the name survives every mail client and filesystem.
  const surname = member.lastName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return surname
    ? `vcdc-member-${member.memberNumber}-${surname}.pdf`
    : `vcdc-member-${member.memberNumber}.pdf`
}

export async function buildMemberCardPdf(member: Member): Promise<Buffer> {
  const status = memberCardStatus()
  if (!status.configured) {
    throw new Error(
      `Member card is not configured. Missing: ${status.missing.join(', ')}`
    )
  }

  const payload = buildMemberQrPayload(member.memberNumber)

  // Error correction M matches the wallet passes, and a wide quiet zone
  // keeps the code readable off a phone screen held at an angle.
  const qrPng = await QRCode.toBuffer(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 600,
    color: { dark: '#2b2d2e', light: '#ffffff' },
  })

  const doc = await PDFDocument.create()
  doc.setTitle(`VCDC membership card, member ${member.memberNumber}`)
  doc.setAuthor('The Vespa Club of D.C., Inc.')
  doc.setProducer('VCDC Operations Hub')

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const regular = await doc.embedFont(StandardFonts.Helvetica)

  // Header band
  const bandHeight = 64
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - bandHeight,
    width: PAGE_WIDTH,
    height: bandHeight,
    color: SKY_BLUE,
  })
  page.drawText('VESPA CLUB OF D.C.', {
    x: MARGIN,
    y: PAGE_HEIGHT - 30,
    size: 13,
    font: bold,
    color: CHARCOAL,
  })
  page.drawText('MEMBER', {
    x: MARGIN,
    y: PAGE_HEIGHT - 48,
    size: 9,
    font: regular,
    color: CHARCOAL,
  })

  // Name
  const name = `${member.firstName} ${member.lastName}`
  let nameSize = 20
  while (bold.widthOfTextAtSize(name, nameSize) > PAGE_WIDTH - MARGIN * 2) {
    nameSize -= 1
  }
  page.drawText(name, {
    x: MARGIN,
    y: PAGE_HEIGHT - bandHeight - 32,
    size: nameSize,
    font: bold,
    color: CHARCOAL,
  })

  // Detail row: member number, tier, expiry
  const detailY = PAGE_HEIGHT - bandHeight - 62
  const columns: Array<{ label: string; value: string; x: number }> = [
    { label: 'MEMBER #', value: String(member.memberNumber), x: MARGIN },
    {
      label: 'TIER',
      value: tierLabels[member.membershipTier],
      x: MARGIN + 96,
    },
    {
      label: 'EXPIRES',
      value: displayDate(member.expiresAt),
      x: MARGIN + 168,
    },
  ]
  for (const column of columns) {
    page.drawText(column.label, {
      x: column.x,
      y: detailY,
      size: 7,
      font: bold,
      color: CHARCOAL,
    })
    page.drawText(column.value, {
      x: column.x,
      y: detailY - 14,
      size: 11,
      font: regular,
      color: CHARCOAL,
    })
  }

  // QR block, centered
  const qrImage = await doc.embedPng(qrPng)
  const qrSize = 176
  const qrX = (PAGE_WIDTH - qrSize) / 2
  const qrY = 96
  page.drawRectangle({
    x: qrX - 10,
    y: qrY - 10,
    width: qrSize + 20,
    height: qrSize + 20,
    color: WHITE,
    borderColor: SKY_BLUE,
    borderWidth: 2,
  })
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize })

  const caption = `Member ${member.memberNumber}`
  page.drawText(caption, {
    x: (PAGE_WIDTH - regular.widthOfTextAtSize(caption, 10)) / 2,
    y: qrY - 26,
    size: 10,
    font: regular,
    color: CHARCOAL,
  })

  // Footer
  const footerLines = [
    'Show this code at ride sign-in.',
    'The Vespa Club of D.C., Inc., a 501(c)(3) nonprofit.',
  ]
  footerLines.forEach((line, index) => {
    page.drawText(line, {
      x: (PAGE_WIDTH - regular.widthOfTextAtSize(line, 8)) / 2,
      y: 44 - index * 12,
      size: 8,
      font: regular,
      color: CHARCOAL,
    })
  })

  return Buffer.from(await doc.save())
}
