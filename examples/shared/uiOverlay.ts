export interface UiOverlay {
  setSpinning(spinning: boolean): void;
  setStatus(text: string): void;
  destroy(): void;
}

export interface UiOverlayOptions {
  /** Element the overlay attaches to. */
  host: HTMLElement;
  /** True when the canvas covers the whole viewport (fixed positioning). */
  fullScreen: boolean;
  /** Render the speed-button cluster (Normal / Turbo / SuperTurbo). */
  showSpeeds: boolean;
  onSpin: () => void;
  onSpeedChange?: (speed: string) => void;
}

/**
 * The button row + status caption shared by every demo. Replaces the older
 * `createUI` helper for demos that need to mount inside a specific host
 * (the website embed) instead of always on `document.body`.
 *
 *   - `fullScreen: true` → fixed-position controls, body-relative.
 *   - `fullScreen: false` → absolute-position controls inside `host`.
 *
 * One shared component so the demos stay visually consistent across the
 * standalone page and the embedded site card.
 */
export function mountUiOverlay(opts: UiOverlayOptions): UiOverlay {
  const { host, fullScreen, showSpeeds, onSpin, onSpeedChange } = opts;

  const wrap = document.createElement('div');
  wrap.style.cssText =
    `${fullScreen ? 'position:fixed;bottom:20px' : 'position:absolute;bottom:12px'};` +
    'left:50%;transform:translateX(-50%);' +
    'display:flex;gap:10px;align-items:center;z-index:1000;font-family:sans-serif;' +
    'touch-action:manipulation;user-select:none;';

  const spinBtn = document.createElement('button');
  spinBtn.textContent = 'SPIN';
  spinBtn.style.cssText =
    'padding:10px 26px;font-size:16px;font-weight:bold;cursor:pointer;' +
    'border:none;border-radius:8px;background:#e74c3c;color:white;' +
    'box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:transform 0.1s;' +
    'min-height:40px;touch-action:manipulation;';
  const onDown = (): void => { spinBtn.style.transform = 'scale(0.95)'; };
  const onUp = (): void => { spinBtn.style.transform = 'scale(1)'; };
  spinBtn.addEventListener('mousedown', onDown);
  spinBtn.addEventListener('mouseup', onUp);
  spinBtn.addEventListener('touchstart', onDown, { passive: true });
  spinBtn.addEventListener('touchend', onUp);
  spinBtn.addEventListener('click', onSpin);
  wrap.appendChild(spinBtn);

  if (showSpeeds && onSpeedChange) {
    const speedRow = document.createElement('div');
    speedRow.style.cssText = 'display:flex;gap:4px;';
    const speeds: Array<['normal' | 'turbo' | 'superTurbo', string]> = [
      ['normal', 'Normal'],
      ['turbo', 'Turbo'],
      ['superTurbo', 'SuperTurbo'],
    ];
    for (const [id, label] of speeds) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText =
        'padding:6px 12px;font-size:12px;cursor:pointer;border:1px solid #666;' +
        'border-radius:6px;background:#2c3e50;color:white;min-height:36px;';
      btn.addEventListener('click', () => {
        onSpeedChange(id);
        speedRow.querySelectorAll('button').forEach((b) => {
          (b as HTMLElement).style.background = '#2c3e50';
        });
        btn.style.background = '#3498db';
      });
      if (id === 'normal') btn.style.background = '#3498db';
      speedRow.appendChild(btn);
    }
    wrap.appendChild(speedRow);
  }

  const status = document.createElement('div');
  status.style.cssText =
    `${fullScreen ? 'position:fixed;bottom:96px' : 'position:absolute;bottom:62px'};` +
    'left:50%;transform:translateX(-50%);' +
    'font-size:12px;color:rgba(255,255,255,0.7);font-family:sans-serif;' +
    'letter-spacing:0.06em;z-index:1000;text-align:center;max-width:90%;' +
    'pointer-events:none;';
  host.appendChild(status);
  host.appendChild(wrap);

  return {
    setSpinning(spinning) {
      spinBtn.textContent = spinning ? 'STOP' : 'SPIN';
      spinBtn.style.background = spinning ? '#e67e22' : '#e74c3c';
    },
    setStatus(text) {
      status.textContent = text;
    },
    destroy() {
      wrap.remove();
      status.remove();
    },
  };
}
