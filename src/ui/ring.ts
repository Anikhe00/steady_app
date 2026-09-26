import type { FastingStatus } from '../lib/dates';
import { formatDuration } from '../lib/dates';
import { formatTime } from './dom';

const R = 88;
const C = 2 * Math.PI * R;

export function ringHtml(): string {
  return `
  <div class="ring" data-phase="fasting" role="img">
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle class="ring-track" cx="100" cy="100" r="${R}"/>
      <circle class="ring-fill" cx="100" cy="100" r="${R}"
        stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 100 100)"/>
    </svg>
    <div class="ring-text" aria-hidden="true">
      <span class="ring-phase"></span>
      <strong class="ring-time"></strong>
      <span class="ring-sub"></span>
    </div>
  </div>`;
}

export function updateRing(root: HTMLElement, s: FastingStatus): void {
  const ring = root.querySelector<HTMLElement>('.ring');
  if (!ring) return;
  ring.dataset.phase = s.phase;
  ring.querySelector<SVGCircleElement>('.ring-fill')!.setAttribute('stroke-dashoffset', String(C * (1 - s.progress)));
  ring.querySelector('.ring-phase')!.textContent = s.phase === 'fasting' ? 'Fasting' : 'Eating window';
  ring.querySelector('.ring-time')!.textContent = formatDuration(s.remainingMs);
  ring.querySelector('.ring-sub')!.textContent =
    s.phase === 'fasting' ? `opens at ${formatTime(s.end)}` : `closes at ${formatTime(s.end)}`;
  ring.setAttribute(
    'aria-label',
    s.phase === 'fasting'
      ? `Fasting. Eating window opens in ${formatDuration(s.remainingMs)}.`
      : `Eating window open. Closes in ${formatDuration(s.remainingMs)}.`,
  );
}
