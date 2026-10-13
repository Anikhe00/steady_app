// iOS-style scroll wheel: each column is a scroll-snap list; the row in the
// middle band is the value. Rows tilt and fade with distance from the middle.

import { esc, prefersReducedMotion } from './dom';

export const ROW_H = 44;
const VISIBLE = 5; // rows shown; must be odd

export interface WheelColumn {
  label: string; // accessible name, e.g. "Hour"
  options: string[];
  index: number;
  align?: 'start' | 'end' | 'center';
}

export interface Wheel {
  el: HTMLElement;
  /** Selected index per column. */
  values: () => number[];
}

export function createWheel(columns: WheelColumn[], onChange?: (values: number[]) => void): Wheel {
  const pad = ((VISIBLE - 1) / 2) * ROW_H;
  const el = document.createElement('div');
  el.className = 'wheel';
  el.style.setProperty('--row-h', `${ROW_H}px`);
  el.style.setProperty('--wheel-h', `${ROW_H * VISIBLE}px`);
  el.innerHTML = `${columns
    .map(
      (c) => `<div class="wheel-col" data-align="${c.align ?? 'center'}" role="spinbutton" tabindex="0"
          aria-label="${esc(c.label)}" aria-valuemin="0" aria-valuemax="${c.options.length - 1}">
        <div class="wheel-list" style="padding-block:${pad}px">
          ${c.options.map((o) => `<div class="wheel-row">${esc(o)}</div>`).join('')}
        </div>
      </div>`,
    )
    .join('')}<div class="wheel-band" aria-hidden="true"></div>`;

  const cols = [...el.querySelectorAll<HTMLElement>('.wheel-col')];
  const current = columns.map((c) => c.index);
  const tilt = !prefersReducedMotion();

  const paint = (i: number) => {
    const col = cols[i];
    const centre = col.scrollTop / ROW_H;
    col.querySelectorAll<HTMLElement>('.wheel-row').forEach((row, r) => {
      const d = Math.max(-3, Math.min(3, r - centre));
      const a = Math.abs(d);
      row.style.opacity = String(Math.max(0.12, 1 - a * 0.32));
      row.style.transform = tilt ? `rotateX(${-d * 22}deg) scale(${1 - a * 0.08})` : '';
      row.classList.toggle('on', a < 0.5);
    });
  };

  const settle = (i: number) => {
    const idx = Math.max(0, Math.min(columns[i].options.length - 1, Math.round(cols[i].scrollTop / ROW_H)));
    cols[i].setAttribute('aria-valuenow', String(idx));
    cols[i].setAttribute('aria-valuetext', columns[i].options[idx]);
    if (idx !== current[i]) {
      current[i] = idx;
      onChange?.([...current]);
    }
  };

  const scrollTo = (i: number, idx: number, smooth = true) =>
    cols[i].scrollTo({ top: idx * ROW_H, behavior: smooth && tilt ? 'smooth' : 'auto' });

  cols.forEach((col, i) => {
    let frame = 0;
    col.addEventListener(
      'scroll',
      () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          paint(i);
          settle(i);
        });
      },
      { passive: true },
    );
    // Tapping a row picks it.
    col.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest('.wheel-row');
      if (row) scrollTo(i, [...col.querySelectorAll('.wheel-row')].indexOf(row));
    });
    col.addEventListener('keydown', (e) => {
      const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[e.key];
      if (step === undefined) return;
      e.preventDefault();
      scrollTo(i, Math.max(0, Math.min(columns[i].options.length - 1, current[i] + step)));
    });
  });

  // Position once the sheet is in the document and laid out.
  requestAnimationFrame(() =>
    cols.forEach((_, i) => {
      scrollTo(i, current[i], false);
      paint(i);
      settle(i);
    }),
  );

  return { el, values: () => [...current] };
}
