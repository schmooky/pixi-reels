import type { CheatEngine, CheatDefinition } from './cheats.js';

/**
 * A tiny framework-free DOM component that renders a collapsible panel of
 * toggleable cheats on top of a demo canvas.
 *
 * ```ts
 * const panel = mountCheatPanel(container, engine, {
 *   title: 'Scatter demo cheats',
 * });
 * // panel.destroy() when done
 * ```
 */
export interface CheatPanelHandle {
  root: HTMLDivElement;
  destroy(): void;
  refresh(): void;
}

export interface CheatPanelOptions {
  title?: string;
  collapsed?: boolean;
}

export function mountCheatPanel(
  parent: HTMLElement,
  engine: CheatEngine,
  opts: CheatPanelOptions = {},
): CheatPanelHandle {
  const root = document.createElement('div');
  root.className = 'pr-cheat-panel';
  Object.assign(root.style, {
    position: 'absolute',
    top: '12px',
    right: '12px',
    background: 'rgba(13, 15, 22, 0.92)',
    color: '#e7ebf5',
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid rgba(120, 140, 200, 0.25)',
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Mono", "Roboto Mono", monospace',
    fontSize: '12px',
    lineHeight: '1.45',
    zIndex: '10',
    maxWidth: '280px',
    backdropFilter: 'blur(6px)',
    boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
  });

  const header = document.createElement('div');
  header.textContent = opts.title ?? 'Cheats';
  Object.assign(header.style, {
    fontWeight: '600',
    letterSpacing: '0.02em',
    marginBottom: '8px',
    cursor: 'pointer',
    userSelect: 'none',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  });
  const chev = document.createElement('span');
  chev.textContent = opts.collapsed ? '+' : '–';
  chev.style.opacity = '0.7';
  header.appendChild(chev);
  root.appendChild(header);

  const body = document.createElement('div');
  body.style.display = opts.collapsed ? 'none' : 'block';
  root.appendChild(body);

  header.addEventListener('click', () => {
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    chev.textContent = open ? '+' : '–';
  });

  const rows: Array<{ def: CheatDefinition; input: HTMLInputElement }> = [];

  function render(): void {
    body.innerHTML = '';
    rows.length = 0;
    for (const def of engine.list()) {
      const label = document.createElement('label');
      Object.assign(label.style, {
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-start',
        padding: '4px 0',
        cursor: 'pointer',
      });

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = def.enabled;
      input.addEventListener('change', () => {
        engine.setEnabled(def.id, input.checked);
      });

      const text = document.createElement('div');
      text.style.flex = '1';
      const title = document.createElement('div');
      title.textContent = def.label;
      title.style.fontWeight = '500';
      const desc = document.createElement('div');
      desc.textContent = def.description ?? '';
      Object.assign(desc.style, {
        opacity: '0.65',
        fontSize: '11px',
        marginTop: '2px',
      });
      text.appendChild(title);
      if (def.description) text.appendChild(desc);

      label.appendChild(input);
      label.appendChild(text);
      body.appendChild(label);

      rows.push({ def, input });
    }

    // Reset-all footer
    const reset = document.createElement('button');
    reset.textContent = 'Disable all';
    Object.assign(reset.style, {
      marginTop: '8px',
      width: '100%',
      padding: '6px 8px',
      background: 'rgba(120, 140, 200, 0.12)',
      border: '1px solid rgba(120, 140, 200, 0.25)',
      borderRadius: '6px',
      color: 'inherit',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: '11px',
    });
    reset.addEventListener('click', () => {
      engine.disableAll();
      refresh();
    });
    body.appendChild(reset);
  }

  function refresh(): void {
    for (const row of rows) {
      row.input.checked = row.def.enabled;
    }
  }

  render();
  parent.appendChild(root);

  return {
    root,
    refresh,
    destroy() {
      root.remove();
    },
  };
}
