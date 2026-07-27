import { forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'danger'

const variants: Record<Variant, string> = {
  primary:
    'bg-vcdc-amber text-white hover:bg-vcdc-amber/90 focus-visible:outline-vcdc-amber',
  secondary:
    'border border-vcdc-cog/40 bg-white text-vcdc-charcoal hover:bg-vcdc-cog/10 focus-visible:outline-vcdc-cog',
  danger:
    'bg-vcdc-red text-white hover:bg-vcdc-red/90 focus-visible:outline-vcdc-red',
}

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(function Button({ variant = 'primary', className = '', ...props }, ref) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  )
})
