import type { FastingStatus } from '../lib/dates';
import { addDays, dateKey, formatDuration } from '../lib/dates';
import { stageAt, stagesFor, type FastStage } from '../lib/stages';
import { esc, formatTime } from './dom';

const R = 88;
const C = 2 * Math.PI * R;
/** Marker centre as a fraction of the ring box (r / viewBox width). */
const MARKER_R = R / 200;
const HOUR = 3_600_000;

export function ringHtml(): string {
  return `
  <div class="ring" data-phase="fasting">
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle class="ring-track" cx="100" cy="100" r="${R}"/>
      <circle class="ring-fill" cx="100" cy="100" r="${R}"
        stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 100 100)"/>
    </svg>
    <div class="ring-text" role="img">
      <span class="ring-phase" aria-hidden="true"></span>
      <strong class="ring-time" aria-hidden="true"></strong>
      <span class="ring-secs" aria-hidden="true"></span>
      <span class="ring-rule" aria-hidden="true"></span>
      <span class="ring-sub" aria-hidden="true"></span>
      <span class="ring-remaining" aria-hidden="true"></span>
    </div>
    <div class="ring-markers" data-markers></div>
  </div>
  <dl class="ring-times">
    <div><dt data-start-label></dt><dd data-start></dd></div>
    <div><dt data-end-label></dt><dd data-end></dd></div>
  </dl>
  <button type="button" class="stage-now" data-action="stage" data-stage="">
    <span class="stage-icon" aria-hidden="true"></span>
    <span class="stage-text">
      <span class="stage-kicker"></span>
      <strong class="stage-title"></strong>
      <span class="stage-next"></span>
    </span>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
  </button>`;
}

function dayWord(d: Date, now: Date): string {
  const key = dateKey(d);
  const today = dateKey(now);
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  if (key === addDays(today, 1)) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

const elapsedText = (ms: number) => {
  const m = Math.floor(ms / 60_000);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

export function updateRing(root: HTMLElement, s: FastingStatus, now = new Date()): void {
  const ring = root.querySelector<HTMLElement>('.ring');
  if (!ring) return;
  const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const fasting = s.phase === 'fasting';
  const elapsedMs = Math.max(0, now.getTime() - s.start.getTime());
  const totalHours = (s.end.getTime() - s.start.getTime()) / HOUR;

  ring.dataset.phase = s.phase;
  q<SVGCircleElement>('.ring-fill').setAttribute('stroke-dashoffset', String(C * (1 - s.progress)));

  if (fasting) {
    q('.ring-phase').textContent = 'Fasting for';
    q('.ring-time').textContent = elapsedText(elapsedMs);
    q('.ring-secs').textContent = `${String(Math.floor(elapsedMs / 1000) % 60).padStart(2, '0')}s`;
    q('.ring-sub').textContent = 'Remaining';
    q('.ring-remaining').textContent = formatDuration(s.remainingMs);
  } else {
    q('.ring-phase').textContent = 'Eating window';
    q('.ring-time').textContent = formatDuration(s.remainingMs);
    q('.ring-secs').textContent = 'left';
    q('.ring-sub').textContent = 'Next fast starts';
    q('.ring-remaining').textContent = formatTime(s.end);
  }
  q('.ring-text').setAttribute(
    'aria-label',
    fasting
      ? `Fasting for ${elapsedText(elapsedMs)}. ${formatDuration(s.remainingMs)} remaining, ends at ${formatTime(s.end)}.`
      : `Eating window open. Closes in ${formatDuration(s.remainingMs)}, at ${formatTime(s.end)}.`,
  );

  q('[data-start-label]').textContent = fasting ? 'Fast started' : 'Window opened';
  q('[data-end-label]').textContent = fasting ? 'Fast ends' : 'Window closes';
  q('[data-start]').textContent = `${dayWord(s.start, now)} ${formatTime(s.start)}`;
  q('[data-end]').textContent = `${dayWord(s.end, now)} ${formatTime(s.end)}`;

  // Stage markers only make sense while fasting.
  const markers = q('[data-markers]');
  const stages = fasting ? stagesFor(totalHours) : [];
  const key = `${s.phase}|${s.start.getTime()}|${s.end.getTime()}`;
  if (markers.dataset.key !== key) {
    markers.dataset.key = key;
    markers.innerHTML = stages
      .map((st) => {
        const angle = (st.hour / totalHours) * 2 * Math.PI - Math.PI / 2;
        const x = 50 + MARKER_R * 100 * Math.cos(angle);
        const y = 50 + MARKER_R * 100 * Math.sin(angle);
        return `<button type="button" class="marker" data-action="stage" data-stage="${st.id}"
          style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%"><span aria-hidden="true">${st.icon}</span></button>`;
      })
      .join('');
  }
  const elapsedH = elapsedMs / HOUR;
  const { current, next } = stageAt(elapsedH, fasting ? totalHours : 24);
  markers.querySelectorAll<HTMLElement>('.marker').forEach((m) => {
    const st = stages.find((x) => x.id === m.dataset.stage)!;
    const reached = st.hour <= elapsedH;
    m.dataset.state = st.id === current.id ? 'current' : reached ? 'reached' : 'ahead';
    m.setAttribute('aria-label', `${st.title}, at ${st.hour} hours, ${reached ? 'reached' : 'coming up'}`);
  });

  const card = q<HTMLButtonElement>('.stage-now');
  card.hidden = !fasting;
  if (fasting) {
    card.dataset.stage = current.id;
    q('.stage-icon').textContent = current.icon;
    q('.stage-kicker').textContent = 'Happening now';
    q('.stage-title').textContent = current.title;
    q('.stage-next').textContent = next
      ? `Next: ${next.title.toLowerCase()} in ${formatDuration((next.hour - elapsedH) * HOUR)}`
      : current.summary;
  }
}

/** Sheet body for one stage, relative to the current fast. */
export function stageSheetHtml(st: FastStage, s: FastingStatus, now = new Date()): string {
  const at = new Date(s.start.getTime() + st.hour * HOUR);
  const reached = at <= now;
  const when = reached
    ? `Reached at ${formatTime(at)}`
    : `In ${formatDuration(at.getTime() - now.getTime())}, at ${formatTime(at)}`;
  return `
    <div class="stack stage-sheet">
      <p class="stage-when"><span class="tag">${st.hour}h into your fast</span> <span class="muted small">${esc(when)}</span></p>
      <p class="big-reply">${esc(st.summary)}</p>
      <p>${esc(st.detail)}</p>
      <p class="stage-tip"><strong>Tip:</strong> ${esc(st.tip)}</p>
      <p class="muted small">Timings are rough averages and differ from person to person. This is general information, not medical advice.</p>
    </div>`;
}
