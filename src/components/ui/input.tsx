import { forwardRef } from 'react'

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = '', ...props }, ref) {
  return (
    <input
      ref={ref}
      className={`block w-full rounded-md border border-vcdc-cog/40 px-3 py-2 text-sm placeholder:text-vcdc-cog focus:border-vcdc-amber focus:outline-none focus:ring-1 focus:ring-vcdc-amber ${className}`}
      {...props}
    />
  )
})
