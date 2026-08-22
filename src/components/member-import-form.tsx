'use client'

import { useActionState } from 'react'
import {
  applyImport,
  initialImportState,
  previewImport,
  type ImportState,
} from '@/app/(admin)/admin/members/import/actions'
import { FIELD_LABELS } from '@/lib/member-import'
import { Button } from '@/components/ui/button'

function Value({ value }: { value: string | null }) {
  if (value === null || value === '') {
    return <span className="text-vcdc-cog/60 italic">empty</span>
  }
  return <span className="font-mono text-xs">{value}</span>
}

function Preview({ state }: { state: ImportState }) {
  const plan = state.plan
  if (!plan) return null

  const total = plan.changes.reduce((n, row) => n + row.changes.length, 0)

  return (
    <div className="mt-8">
      {plan.errors.length > 0 && (
        <div className="rounded-lg border border-vcdc-red/40 bg-vcdc-red/5 p-4">
          <h2 className="text-sm font-medium">
            {plan.errors.length}{' '}
            {plan.errors.length === 1 ? 'problem' : 'problems'} in the file
          </h2>
          <p className="mt-1 text-xs text-vcdc-cog">
            Nothing will be changed until every one is fixed. A half-applied
            spreadsheet is worse than a rejected one, because afterwards
            nobody can tell which rows landed.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {plan.errors.map((error, i) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 font-mono text-xs text-vcdc-cog">
                  {error.line > 0 ? `line ${error.line}` : 'file'}
                  {error.reference && ` · ${error.reference}`}
                </span>
                <span>{error.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.errors.length === 0 && plan.changes.length === 0 && (
        <div className="rounded-lg border border-vcdc-cog/30 p-6 text-sm">
          <p className="font-medium">Nothing to change.</p>
          <p className="mt-1 text-vcdc-cog">
            The file read cleanly and every row already matches what is on
            file{plan.unchangedRows > 0 && ` (${plan.unchangedRows} rows checked)`}.
          </p>
        </div>
      )}

      {plan.changes.length > 0 && (
        <>
          <div className="rounded-lg border border-vcdc-cog/30 bg-vcdc-sunburst/20 p-4">
            <h2 className="text-sm font-medium">
              {total} {total === 1 ? 'change' : 'changes'} across{' '}
              {plan.changes.length}{' '}
              {plan.changes.length === 1 ? 'member' : 'members'}
            </h2>
            <p className="mt-1 text-xs text-vcdc-cog">
              Nothing has been written yet. Read this, then apply.
              {plan.unchangedRows > 0 &&
                ` ${plan.unchangedRows} other rows matched what is already on file and are not listed.`}
            </p>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-vcdc-cog/30">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-vcdc-cog/30 bg-vcdc-cog/10 text-xs uppercase text-vcdc-cog">
                <tr>
                  <th className="px-4 py-2">Member</th>
                  <th className="px-4 py-2">Field</th>
                  <th className="px-4 py-2">Now</th>
                  <th className="px-4 py-2">Becomes</th>
                </tr>
              </thead>
              <tbody>
                {plan.changes.map((row) =>
                  row.changes.map((change, i) => (
                    <tr
                      key={`${row.memberId}-${change.field}`}
                      className="border-b border-vcdc-cog/15 last:border-0"
                    >
                      <td className="px-4 py-2">
                        {i === 0 && (
                          <>
                            {row.name}
                            <span className="ml-2 font-mono text-xs text-vcdc-cog">
                              {row.memberNumber}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2 text-vcdc-cog">
                        {FIELD_LABELS[change.field]}
                      </td>
                      <td className="px-4 py-2">
                        <Value value={change.from} />
                      </td>
                      <td className="px-4 py-2">
                        <Value value={change.to} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export function MemberImportForm() {
  const [state, formAction, pending] = useActionState(
    previewImport,
    initialImportState
  )
  const [applyState, applyAction, applying] = useActionState(
    applyImport,
    initialImportState
  )

  // Once something has been applied, that result is the current truth.
  const showApplied = applyState.stage === 'applied'
  const active = applyState.stage === 'preview' ? applyState : state

  if (showApplied) {
    return (
      <div className="mt-6 rounded-lg border border-vcdc-green/40 bg-vcdc-green/5 p-6">
        <h2 className="font-medium">
          Updated {applyState.appliedCount}{' '}
          {applyState.appliedCount === 1 ? 'member' : 'members'}.
        </h2>
        <p className="mt-1 text-sm text-vcdc-cog">
          The roster review and the card links CSV both reflect this now.
        </p>
        <div className="mt-4 flex gap-3">
          <a
            href="/admin/members/review"
            className="text-sm font-medium text-vcdc-amber hover:underline"
          >
            See what is still missing
          </a>
          <a
            href="/admin/members/import"
            className="text-sm font-medium text-vcdc-cog hover:underline"
          >
            Upload another file
          </a>
        </div>
      </div>
    )
  }

  return (
    <>
      <form action={formAction} className="mt-6 space-y-3">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-vcdc-cog/10 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-vcdc-cog/20"
        />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? 'Reading...' : 'Check the file'}
        </Button>
      </form>

      {(state.error || applyState.error) && (
        <p className="mt-4 text-sm text-vcdc-red">
          {applyState.error ?? state.error}
        </p>
      )}

      <Preview state={active} />

      {active.plan &&
        active.plan.errors.length === 0 &&
        active.plan.changes.length > 0 && (
          <form action={applyAction} className="mt-6">
            <input type="hidden" name="csvText" value={active.csvText ?? ''} />
            <Button type="submit" disabled={applying}>
              {applying
                ? 'Applying...'
                : `Apply these ${active.plan.changes.length} members`}
            </Button>
          </form>
        )}
    </>
  )
}
