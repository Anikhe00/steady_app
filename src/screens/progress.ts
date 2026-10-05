import * as db from '../lib/db';
import { dateKey } from '../lib/dates';
import { dayTone, streak, toDisplay, topTriggers, weekSummary, weightSeries } from '../lib/stats';
import { TRIGGER_LABELS } from '../lib/types';
import { esc, formatDay, onAction } from '../ui/dom';
import { confirmSheet, toast } from '../ui/sheet';
import { weightChartHtml, wireWeightChart } from '../ui/weight-chart';

const TONE_LABEL = {
  all: 'everything done',
  some: 'some done',
  none: 'missed',
  pending: 'in progress',
  outside: 'not tracked',
} as const;

export function renderProgress(root: HTMLElement): void {
  const s = db.data.settings!;
  const today = dateKey(new Date());
  const st = streak(db.data, today);
  const wk = weekSummary(db.data, today);
  const triggers = topTriggers(db.data, today);
  const maxTrigger = triggers[0]?.[1] ?? 0;
  const { raw, avg } = weightSeries(db.data);
  const toUnit = (p: { date: string; value: number }) => ({ date: p.date, value: toDisplay(p.value, s.unit) });
  const recentWeighIns = [...db.data.weighIns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const change = avg.length > 1 ? toDisplay(avg[avg.length - 1].value - avg[0].value, s.unit) : null;

  root.innerHTML = `
    <header class="screen-head">
      <p class="eyebrow">Progress</p>
      <h1>How it's going</h1>
    </header>

    <section class="card" aria-labelledby="h-week">
      <h2 id="h-week" class="card-title">This week</h2>
      <ol class="week">
        ${wk.week
          .map((d) => {
            const tone = dayTone(db.data, d, today);
            const slipped = db.data.slips.some((x) => x.date === d);
            const name = formatDay(d, { weekday: 'short' });
            const inner = `
              <span class="sr-only">${esc(formatDay(d))}: ${TONE_LABEL[tone]}${slipped ? ', slip logged' : ''}</span>
              <span class="tile-day" aria-hidden="true">${esc(name.slice(0, 2))}</span>
              <span class="tile-dot" aria-hidden="true"></span>
              ${slipped ? '<span class="tile-slip" aria-hidden="true"></span>' : ''}`;
            const current = d === today ? 'aria-current="date"' : '';
            // Tracked days open on Today so a missed one can be filled in.
            return tone === 'outside'
              ? `<li><span class="tile" data-tone="${tone}" ${current}>${inner}</span></li>`
              : `<li><a class="tile" data-tone="${tone}" ${current} href="${d === today ? '#/today' : `#/today/${d}`}">${inner}</a></li>`;
          })
          .join('')}
      </ol>
      <p class="legend small">
        <span><i class="sw all"></i>All done</span><span><i class="sw some"></i>Some</span>
        <span><i class="sw none"></i>Missed</span><span><i class="sw slip"></i>Slip</span>
      </p>
      <p class="muted small">Tap a day to fill in anything you forgot.</p>
    </section>

    <section class="card streak-card" aria-labelledby="h-streak">
      <div>
        <h2 id="h-streak" class="card-title">Streak</h2>
        <p class="hero-num">${st.streak}<span> day${st.streak === 1 ? '' : 's'}</span></p>
      </div>
      <p class="muted small">${
        st.missedYesterday
          ? 'You missed yesterday, and your streak is still here. Check in today to keep it.'
          : 'Never miss twice: one off day never breaks it. Two in a row does.'
      }</p>
    </section>

    <section class="stats" aria-label="This week's numbers">
      <div class="stat"><strong>${wk.fasts}<span>/7</span></strong><span>fasts kept</span></div>
      <div class="stat"><strong>${wk.mealCount}</strong><span>meals logged</span></div>
      <div class="stat"><strong>${wk.avgFullness === null ? '–' : wk.avgFullness.toFixed(1)}</strong><span>avg fullness</span></div>
    </section>

    <section class="card" aria-labelledby="h-weight">
      <div class="row between">
        <h2 id="h-weight" class="card-title">Weight trend</h2>
        ${
          change !== null
            ? `<p class="small muted">${change <= 0 ? '▼' : '▲'} ${Math.abs(change).toFixed(1)} ${s.unit} since start</p>`
            : ''
        }
      </div>
      ${weightChartHtml(raw.map(toUnit), avg.map(toUnit), s.unit)}
      ${
        recentWeighIns.length
          ? `<details class="recent"><summary>Recent weigh-ins</summary><ul class="entries compact">${recentWeighIns
              .map(
                (w) => `<li class="entry"><span>${esc(formatDay(w.date, { weekday: 'short', month: 'short', day: 'numeric' }))}</span>
                  <strong>${toDisplay(w.kg, s.unit).toFixed(1)} ${s.unit}</strong>
                  <button class="icon-btn" data-action="del-weigh" data-id="${esc(w.id)}" aria-label="Delete weigh-in">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>
                  </button></li>`,
              )
              .join('')}</ul></details>`
          : ''
      }
    </section>

    <section class="card" aria-labelledby="h-triggers">
      <h2 id="h-triggers" class="card-title">Slip triggers, last 30 days</h2>
      ${
        triggers.length
          ? `<ul class="bars">${triggers
              .slice(0, 5)
              .map(
                ([t, n]) => `<li><span class="bar-label">${esc(TRIGGER_LABELS[t])}</span>
                  <span class="bar-track"><span class="bar" style="width:${(n / maxTrigger) * 100}%"></span></span>
                  <span class="bar-val">${n}</span></li>`,
              )
              .join('')}</ul>
            <p class="muted small">Knowing your top trigger is how you plan around it.</p>`
          : '<p class="empty">No slips logged in the last 30 days.</p>'
      }
    </section>
  `;

  wireWeightChart(root, s.unit);
  onAction(root, {
    'del-weigh': async (el) => {
      if (await confirmSheet('Delete weigh-in?', 'This removes it from your trend.', 'Delete', true)) {
        await db.deleteWeighIn(el.dataset.id!);
        toast('Weigh-in deleted');
      }
    },
  });
}
