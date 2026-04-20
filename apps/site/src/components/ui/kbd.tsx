/** @jsxImportSource react */
import { type ReactNode } from 'react';
import { Command, CornerDownLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KbdProps {
  children?: ReactNode;
  icon?: 'cmd' | 'enter';
  className?: string;
}

/**
 * Keyboard key chip. Renders either a text key ("Ctrl", "Shift") or a
 * lucide-react icon for the Cmd and Enter keys — avoids the non-ASCII
 * unicode glyphs the repo's fancy-unicode guard forbids.
 */
export function Kbd({ children, icon, className }: KbdProps) {
  const base = 'inline-flex h-5 min-w-[1.25rem] items-center justify-center gap-0.5 rounded border border-border bg-background/80 px-1 font-mono text-[10px] font-medium text-muted-foreground shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.04)]';
  return (
    <kbd className={cn(base, className)}>
      {icon === 'cmd' ? <Command size={10} strokeWidth={2.5} /> : null}
      {icon === 'enter' ? <CornerDownLeft size={10} strokeWidth={2.5} /> : null}
      {children ? <span>{children}</span> : null}
    </kbd>
  );
}

/**
 * Key chord — renders multiple `<Kbd>` separated by a `+`. Use this for
 * shortcuts like "Cmd+Enter" or "Ctrl+S".
 */
export function KbdChord({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {children}
    </span>
  );
}
