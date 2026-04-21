/** Creates a basic HTML overlay UI for examples. */
export function createUI(options: {
  onSpin: () => void;
  onSpeedChange?: (speed: string) => void;
  speeds?: string[];
}) {
  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
    'display:flex;gap:12px;align-items:center;z-index:1000;font-family:sans-serif;' +
    'touch-action:manipulation;user-select:none;';

  // Spin button
  const spinBtn = document.createElement('button');
  spinBtn.textContent = 'SPIN';
  spinBtn.style.cssText =
    'padding:12px 32px;font-size:18px;font-weight:bold;cursor:pointer;' +
    'border:none;border-radius:8px;background:#e74c3c;color:white;' +
    'box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:transform 0.1s;' +
    'min-height:44px;touch-action:manipulation;';
  spinBtn.addEventListener('mousedown', () => (spinBtn.style.transform = 'scale(0.95)'));
  spinBtn.addEventListener('mouseup', () => (spinBtn.style.transform = 'scale(1)'));
  spinBtn.addEventListener('touchstart', () => (spinBtn.style.transform = 'scale(0.95)'), { passive: true });
  spinBtn.addEventListener('touchend', () => (spinBtn.style.transform = 'scale(1)'));
  spinBtn.addEventListener('click', options.onSpin);
  container.appendChild(spinBtn);

  // Speed buttons
  if (options.speeds && options.onSpeedChange) {
    const speedContainer = document.createElement('div');
    speedContainer.style.cssText = 'display:flex;gap:4px;';

    for (const speed of options.speeds) {
      const btn = document.createElement('button');
      btn.textContent = speed.charAt(0).toUpperCase() + speed.slice(1);
      btn.style.cssText =
        'padding:8px 16px;font-size:14px;cursor:pointer;border:1px solid #666;' +
        'border-radius:6px;background:#2c3e50;color:white;' +
        'min-height:44px;touch-action:manipulation;';
      btn.addEventListener('click', () => {
        options.onSpeedChange!(speed);
        // Highlight active
        speedContainer.querySelectorAll('button').forEach((b) => {
          (b as HTMLElement).style.background = '#2c3e50';
        });
        btn.style.background = '#3498db';
      });
      if (speed === 'normal') btn.style.background = '#3498db';
      speedContainer.appendChild(btn);
    }
    container.appendChild(speedContainer);
  }

  // Win display
  const winDisplay = document.createElement('div');
  winDisplay.id = 'win-display';
  winDisplay.style.cssText =
    'padding:8px 16px;font-size:16px;color:#f1c40f;font-weight:bold;' +
    'min-width:80px;text-align:center;';
  container.appendChild(winDisplay);

  document.body.appendChild(container);

  return {
    spinButton: spinBtn,
    setSpinning(spinning: boolean) {
      spinBtn.textContent = spinning ? 'STOP' : 'SPIN';
      spinBtn.style.background = spinning ? '#e67e22' : '#e74c3c';
    },
    showWin(amount: number) {
      winDisplay.textContent = amount > 0 ? `WIN: ${amount}` : '';
    },
  };
}
