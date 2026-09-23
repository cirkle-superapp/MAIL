/**
 * ThemeToggle.tsx
 * -----------------------------------------------------------------------------
 * Light / dark theme toggle. The CIRKLE theme has a premium dark variant
 * (gold-on-charcoal + glass morphism) that's loaded via the `dark` class on
 * <html>. This component:
 *   - Reads the initial theme from localStorage `cirkle-theme` (set by the
 *     FOUC-prevention script in layout.tsx).
 *   - Toggles the `dark` class on documentElement.
 *   - Persists the choice.
 *   - Respects prefers-reduced-motion (the icon swap is instant, no spin).
 */

'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  // The FOUC script in layout.tsx already applied the `dark` class if needed.
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<Theme>('light')
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    setTheme(getInitialTheme())
  }, [])

  const toggle = React.useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      try {
        if (next === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
        localStorage.setItem('cirkle-theme', next)
      } catch {
        // localStorage may be unavailable (private mode / SSR).
      }
      return next
    })
  }, [])

  // Before mount, render a placeholder with the same dimensions to avoid
  // layout shift + hydration mismatch.
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn('size-9 shrink-0', className)}
        aria-label="Toggle theme"
        disabled
      >
        <Sun className="size-4" aria-hidden />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={cn('size-9 shrink-0', className)}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? (
        <Sun className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
    </Button>
  )
}

export default ThemeToggle
