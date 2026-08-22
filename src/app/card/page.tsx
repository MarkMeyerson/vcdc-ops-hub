import type { Metadata } from 'next'
import { CardLookupForm } from '@/components/card-lookup-form'

export const metadata: Metadata = {
  title: 'Get your membership card | VCDC',
  description:
    'Download your Vespa Club of D.C. membership card as a printable PDF.',
}

export default function CardPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-vcdc-sky/20 p-4">
      <div className="w-full max-w-sm rounded-lg border border-vcdc-cog/30 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Your membership card</h1>
        <p className="mt-2 text-sm text-vcdc-cog">
          Enter your member number and last name. Your card opens as a PDF you
          can save to your phone or print.
        </p>

        <CardLookupForm />

        <p className="mt-6 border-t border-vcdc-cog/20 pt-4 text-xs text-vcdc-cog">
          Do not know your member number? Ask any club officer at a ride or
          happy hour and they can look it up.
        </p>
      </div>
    </main>
  )
}
