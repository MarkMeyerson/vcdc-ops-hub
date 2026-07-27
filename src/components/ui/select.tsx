import { forwardRef } from 'react'

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = '', ...props }, ref) {
  return (
    <select
      ref={ref}
      className={`block w-full rounded-md border border-vcdc-cog/40 bg-white px-3 py-2 text-sm focus:border-vcdc-amber focus:outline-none focus:ring-1 focus:ring-vcdc-amber ${className}`}
      {...props}
    />
  )
})
