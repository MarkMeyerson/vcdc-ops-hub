import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { MemberImportForm } from '@/components/member-import-form'
import { TEMPLATE_HEADERS } from '@/lib/member-import'

// Bulk update from a spreadsheet. The everyday path is the admin UI one
// member at a time; this is for the catch-up, where most of the roster is
// missing the same few fields and collecting them is spreadsheet work.

export const dynamic = 'force-dynamic'

export default async function MemberImportPage() {
  await requireAdmin()

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/members"
        className="text-sm text-vcdc-cog hover:underline"
      >
        Back to members
      </Link>

      <h1 className="mt-2 text-2xl font-semibold">Bulk update</h1>
      <p className="mt-2 text-sm text-vcdc-cog">
        Download the roster as a spreadsheet, fill in what is missing, upload
        it back. Useful when the same field is missing for most of the club.
        For one or two members, editing them directly is faster.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase text-vcdc-cog">
          1. Download
        </h2>
        <div className="mt-3 rounded-lg border border-vcdc-cog/30 p-4">
          <a
            href="/admin/members/import/template"
            className="inline-flex items-center rounded-md bg-vcdc-amber px-4 py-2 text-sm font-medium text-white hover:bg-vcdc-amber/90"
          >
            Download spreadsheet
          </a>
          <p className="mt-3 text-sm text-vcdc-cog">
            Every member, one per row, with what is already on file. Opens in
            Excel or Google Sheets. Columns:
          </p>
          <p className="mt-2 break-all rounded-md bg-vcdc-cog/10 p-3 font-mono text-xs">
            {TEMPLATE_HEADERS.join(', ')}
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase text-vcdc-cog">
          2. Fill it in
        </h2>
        <div className="mt-3 rounded-lg border border-vcdc-cog/30 p-4 text-sm">
          <ul className="space-y-2">
            <li>
              <span className="font-medium">
                A blank cell leaves that value alone.
              </span>{' '}
              Filling in twenty email addresses will not wipe the other
              seventy-six. To clear something, edit that member directly.
            </li>
            <li>
              <span className="font-medium">Do not change member_number.</span>{' '}
              It is how each row finds its member. Everything else can be
              corrected, names included.
            </li>
            <li>
              <span className="font-medium">Do not add rows.</span> New members
              are added from the Members page; a number that does not exist
              yet will be reported rather than created.
            </li>
            <li>
              <span className="font-medium">Dates</span> read as either
              2026-12-31 or 12/31/2026, so it does not matter what Excel does
              to them.
            </li>
            <li>
              <span className="font-medium">Tier</span> must be regular,
              lifetime, or honorary.
            </li>
          </ul>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase text-vcdc-cog">
          3. Upload
        </h2>
        <p className="mt-2 text-sm text-vcdc-cog">
          You will see exactly what would change before anything is written,
          and if any row has a problem, nothing is applied until it is fixed.
        </p>
        <MemberImportForm />
      </section>
    </div>
  )
}
