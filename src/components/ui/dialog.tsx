'use client'

import * as React from 'react'

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      {children}
    </div>
  )
}

export function DialogContent({
  children,
  onEscapeKeyDown,
  onOpenChange,
}: {
  children: React.ReactNode
  onEscapeKeyDown?: () => void
  onOpenChange?: (open: boolean) => void
}) {
  const contentRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscapeKeyDown?.()
        onOpenChange?.(false)
      }
    }

    const handleBackdropClick = (e: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
        onOpenChange?.(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    document.addEventListener('click', handleBackdropClick)

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('click', handleBackdropClick)
    }
  }, [onEscapeKeyDown, onOpenChange])

  return (
    <div
      ref={contentRef}
      className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-4">{children}</div>
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold">{children}</h2>
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-vcdc-cog">{children}</p>
}
