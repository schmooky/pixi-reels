/** @jsxImportSource react */
import * as React from 'react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Sparkles, ChevronDown, RotateCcw } from 'lucide-react';
import type { CheatEngine, CheatDefinition } from '../../../../examples/shared/cheats.ts';
import { cn } from '@/lib/utils';

export interface CheatPanelReactProps {
  engine: CheatEngine;
  title?: string;
  collapsed?: boolean;
}

export default function CheatPanelReact({ engine, title = 'Demo cheats', collapsed = false }: CheatPanelReactProps) {
  const [open, setOpen] = React.useState(!collapsed);
  // We mirror engine state in react for re-renders
  const initial = React.useMemo(() => engine.list().map((c) => ({ ...c })), [engine]);
  const [state, setState] = React.useState<CheatDefinition[]>(initial);

  const toggle = (id: string, checked: boolean) => {
    engine.setEnabled(id, checked);
    setState((prev) => prev.map((c) => (c.id === id ? { ...c, enabled: checked } : c)));
  };

  const disableAll = () => {
    engine.disableAll();
    setState((prev) => prev.map((c) => ({ ...c, enabled: false })));
  };

  return (
    <Card className="absolute right-3 top-3 z-10 w-[300px] glass shadow-xl shadow-primary/10">
      <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles size={14} strokeWidth={2} className="text-primary" />
          {title}
        </CardTitle>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          <ChevronDown
            size={14}
            strokeWidth={2}
            className={cn('transition-transform', !open && '-rotate-90')}
          />
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-0 p-4 pt-0">
          <div className="space-y-3">
            {state.map((def) => (
              <label
                key={def.id}
                className="flex cursor-pointer items-start justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground">{def.label}</div>
                  {def.description && (
                    <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {def.description}
                    </div>
                  )}
                </div>
                <Switch
                  checked={def.enabled}
                  onCheckedChange={(v) => toggle(def.id, v)}
                  className="mt-0.5"
                />
              </label>
            ))}
          </div>
          {state.length > 0 && (
            <>
              <div className="my-3 h-px bg-border/60" />
              <Button
                variant="ghost"
                size="sm"
                onClick={disableAll}
                className="w-full justify-center text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw size={12} strokeWidth={2} />
                Disable all
              </Button>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
