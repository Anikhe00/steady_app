import { parseKey, type Point } from '../lib/dates';
import { esc, formatDay } from './dom';

const W = 340;
const H = 180;
const PAD = { top: 16, right: 12, bottom: 24, left: 36 };

/**
 * Weight trend: the 7-day rolling average as the line, raw weigh-ins as faint
 * dots. Values are already in the display unit.
 */
export function weightChartHtml(raw: Point[], avg: Point[], unit: string): string {
  if (raw.length === 0) {
    return `<p class="empty">No weigh-ins yet. Your trend line appears after your first one.</p>`;
  }
  const t = (p: Point) => parseKey(p.date).getTime();
  const t0 = t(raw[0]);
  const t1 = Math.max(t(raw[raw.length - 1]), t0 + 6 * 86_400_000);
  const values = [...raw, ...avg].map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const span = Math.max(hi - lo, 2);
  lo = Math.floor(lo - span * 0.15);
  hi = Math.ceil(hi + span * 0.15);

  const x = (p: Point) => PAD.left + ((t(p) - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);

  const ticks = [lo, (lo + hi) / 2, hi];
  const grid = ticks
    .map(
      (v) => `<line class="grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v)}" y2="${y(v)}"/>
        <text class="axis" x="${PAD.left - 6}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(v % 1 ? 1 : 0)}</text>`,
    )
    .join('');
  const short = (p: Point) => formatDay(p.date, { month: 'short', day: 'numeric' });
  const xLabels = `
    <text class="axis" x="${PAD.left}" y="${H - 6}">${esc(short(raw[0]))}</text>
    ${raw.length > 1 ? `<text class="axis" x="${W - PAD.right}" y="${H - 6}" text-anchor="end">${esc(short(raw[raw.length - 1]))}</text>` : ''}`;
  const dots = raw.map((p) => `<circle class="raw" cx="${x(p)}" cy="${y(p.value)}" r="3"/>`).join('');
  const line = avg.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const last = avg[avg.length - 1];

  const table = avg
    .map((p) => {
      const r = raw.filter((q) => q.date === p.date).at(-1)!;
      return `<tr><td>${esc(short(p))}</td><td>${r.value.toFixed(1)}</td><td>${p.value.toFixed(1)}</td></tr>`;
    })
    .reverse()
    .join('');

  return `
    <figure class="chart" data-chart>
      <svg viewBox="0 0 ${W} ${H}" role="img"
        aria-label="Weight trend. Latest 7-day average ${last.value.toFixed(1)} ${esc(unit)}.">
        ${grid}${xLabels}
        ${dots}
        <path class="avg" d="${line}"/>
        <circle class="avg-end" cx="${x(last)}" cy="${y(last.value)}" r="4.5"/>
        <line class="cross" y1="${PAD.top}" y2="${H - PAD.bottom}" hidden/>
        <rect class="hit" x="${PAD.left}" y="0" width="${W - PAD.left - PAD.right}" height="${H}"/>
      </svg>
      <div class="chart-tip" hidden></div>
      <figcaption class="legend">
        <span><i class="key-line" aria-hidden="true"></i>7-day average</span>
        <span><i class="key-dot" aria-hidden="true"></i>Weigh-ins</span>
      </figcaption>
      <details class="chart-table">
        <summary>Show as table</summary>
        <table><thead><tr><th>Day</th><th>Weigh-in (${esc(unit)})</th><th>7-day avg</th></tr></thead>
        <tbody>${table}</tbody></table>
      </details>
    </figure>
    <script type="application/json" data-points>${JSON.stringify(
      avg.map((p) => ({ x: x(p), y: y(p.value), label: short(p), avg: p.value, raw: raw.filter((q) => q.date === p.date).at(-1)!.value })),
    )}</script>`;
}

/** Nearest-point tooltip for pointer and touch. */
export function wireWeightChart(root: HTMLElement, unit: string): void {
  const fig = root.querySelector<HTMLElement>('[data-chart]');
  const json = root.querySelector('[data-points]');
  if (!fig || !json) return;
  const pts: { x: number; y: number; label: string; avg: number; raw: number }[] = JSON.parse(json.textContent!);
  const svg = fig.querySelector('svg')!;
  const cross = svg.querySelector<SVGLineElement>('.cross')!;
  const tip = fig.querySelector<HTMLElement>('.chart-tip')!;

  const show = (ev: PointerEvent) => {
    const box = svg.getBoundingClientRect();
    const vx = ((ev.clientX - box.left) / box.width) * W;
    const p = pts.reduce((a, b) => (Math.abs(b.x - vx) < Math.abs(a.x - vx) ? b : a));
    cross.setAttribute('x1', String(p.x));
    cross.setAttribute('x2', String(p.x));
    cross.removeAttribute('hidden');
    tip.hidden = false;
    tip.innerHTML = `<strong>${esc(p.label)}</strong><span>Avg ${p.avg.toFixed(1)} ${esc(unit)}</span><span class="muted">Weighed ${p.raw.toFixed(1)}</span>`;
    const left = (p.x / W) * box.width;
    tip.style.left = `${Math.min(Math.max(left, 60), box.width - 60)}px`;
    tip.style.top = `${(p.y / H) * box.height}px`;
  };
  const hide = () => {
    cross.setAttribute('hidden', '');
    tip.hidden = true;
  };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', hide);
}
