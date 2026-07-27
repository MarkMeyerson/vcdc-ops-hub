export function Label({
  className = '',
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`block text-sm font-medium text-vcdc-charcoal ${className}`}
      {...props}
    />
  )
}
