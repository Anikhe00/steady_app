import * as db from '../lib/db';
import { addDays, dateKey, formatDuration, logDay } from '../lib/dates';
import { fastStateFor } from '../lib/fasting';
import { dayPlan, scheduleOf } from '../lib/schedule';
import { dayCounted, streak, toDisplay } from '../lib/stats';
import type { Settings } from '../lib/types';
import { esc, formatDay, formatTime, onAction } from '../ui/dom';
import { dayTime, openEditStartSheet, openEndFastSheet, openMoveNextFastSheet, startFastNow } from '../ui/fast-sheets';
import { openMealSheet, openSlipSheet, parseWeight } from '../ui/forms';
import { STAGES } from '../lib/stages';
import { ringHtml, stageSheetHtml, updateRing } from '../ui/ring';
import { openSheet, toast } from '../ui/sheet';
import { openFoodDay } from './food';

const stateNow = (s: Settings, now = new Date()) => fastStateFor(s, db.data.fasts, now);
const HOUR = 3_600_000;

/** Today, or a past day being filled in when `requested` names one. */
export function renderToday(root: HTMLElement, requested?: string): () => void {
  const s = db.data.settings!;
  const today = dateKey(new Date());
  const yesterday = addDays(today, -1);
  const day = logDay(requested, today, s.startDate);
  if (day !== today) return renderPastDay(root, day, today);
  const st = streak(db.data, today);
  const slippedToday = db.data.slips.some((x) => x.date === today);
  const missedYesterday = st.missedYesterday && yesterday >= s.startDate;
  const initial = stateNow(s);
  const sched = scheduleOf(s);
  const restDay = dayPlan(sched, today).kind === 'rest';

  root.innerHTML = `
    <header class="screen-head">
      <p class="eyebrow">${esc(formatDay(today))}${restDay ? ' · Rest day' : ''}</p>
      <h1>Today</h1>
      ${streakChip(st.streak)}
    </header>

    ${dayNavHtml(today, today, s.startDate)}

    ${
      missedYesterday && dayCounted(db.data, today)
        ? `<section class="banner info" role="status">
            <strong>You bounced back.</strong>
            <span>Yesterday was a miss and today you showed up anyway. That's the whole skill.</span>
          </section>`
        : missedYesterday
        ? `<section class="banner warn" role="status">
            <strong>Yesterday got away from you.</strong>
            <span>That's one. The rule is never miss twice, so today is the day that matters. Tick off one thing and you're back on track.</span>
            <button class="link-btn fill-in" data-action="fill-yesterday">Did more than you logged? Fill in yesterday</button>
          </section>`
        : ''
    }
    ${
      (missedYesterday || slippedToday) && s.why
        ? `<section class="why-card" aria-label="Your why">
            <p class="eyebrow">Remember why you started</p>
            <blockquote>${esc(s.why)}</blockquote>
          </section>`
        : ''
    }

    <div class="banner info" data-closing hidden role="status"></div>

    <section class="card ring-card" aria-label="Fasting window">
      ${ringHtml()}
      <p class="window-line" data-window-line></p>
      ${
        initial.phase === 'fasting'
          ? `<div class="row gap fast-actions">
               <button class="btn ghost grow" data-action="edit-start">Edit start time</button>
               <button class="btn primary grow" data-action="end-fast">${initial.dry ? 'Break fast' : 'End fast'}</button>
             </div>`
          : `<div class="row gap fast-actions">
               <button class="btn ghost small grow" data-action="move-next">Move next fast</button>
               <button class="btn ghost small grow" data-action="start-now">Start fast now</button>
             </div>`
      }
    </section>

    ${logSectionsHtml(today, today)}
  `;

  onAction(root, {
    'end-fast': () => openEndFastSheet(stateNow(s), sched),
    'edit-start': () => openEditStartSheet(stateNow(s)),
    'move-next': () => openMoveNextFastSheet(stateNow(s)),
    'start-now': () => startFastNow(sched),
    ...dayNavActions(today),
    'fill-yesterday': () => (location.hash = `#/today/${yesterday}`),
    meal: () => openMealSheet(today),
    slip: () => openSlipSheet(),
    stage: (el) => {
      const st = STAGES.find((x) => x.id === el.dataset.stage);
      if (!st) return;
      openSheet(`<span aria-hidden="true">${st.icon}</span> ${esc(st.title)}`, stageSheetHtml(st, stateNow(s)));
    },
  });

  wireLogSections(root, today);

  // Live countdown. Only the ring and the closing banner update; the rest of
  // the screen re-renders on data changes.
  const closing = root.querySelector<HTMLElement>('[data-closing]')!;
  const line = root.querySelector<HTMLElement>('[data-window-line]')!;
  const tick = () => {
    const now = new Date();
    if (dateKey(now) !== today) {
      window.dispatchEvent(new Event('steady:rerender'));
      return;
    }
    const state = stateNow(s, now);
    // Phase flipped (the eating window closed): swap the buttons.
    if (state.phase !== initial.phase) {
      window.dispatchEvent(new Event('steady:rerender'));
      return;
    }
    updateRing(root, state, now);
    const goal = formatDuration(state.goalHours * HOUR);
    line.textContent =
      state.phase === 'fasting'
        ? state.over
          ? state.dry
            ? `Iftar time. Your ${goal} goal is reached, break your fast whenever you're ready.`
            : `Goal of ${goal} reached. End your fast whenever you're ready.`
          : state.dry
          ? `Dry fast: no food or water until ${formatTime(state.target)}.`
          : `Goal: ${goal} fast, until ${dayTime(state.target, now)}. Your eating window starts when you end it.`
        : state.dry
        ? `Eat and drink until ${dayTime(state.end, now)}. Your dry fast starts then.`
        : `Eat until ${dayTime(state.end, now)}. Your next fast starts then.`;
    const soon = state.phase === 'eating' && state.remainingMs <= 3_600_000;
    closing.hidden = !soon;
    if (soon) closing.textContent = `Your eating window closes in ${formatDuration(state.remainingMs)}.`;
  };
  tick();
  const timer = window.setInterval(tick, 1000);
  return () => clearInterval(timer);
}

// ---------------------------------------------------------------- shared

const streakChip = (n: number) => `<p class="streak-chip" aria-label="Streak: ${n} days">
  <span aria-hidden="true">●</span> ${n} day${n === 1 ? '' : 's'} steady
</p>`;

const dayHash = (d: string, today: string) => (d === today ? '#/today' : `#/today/${d}`);

function dayNavHtml(day: string, today: string, start: string): string {
  const label =
    day === today ? 'Today' : day === addDays(today, -1) ? 'Yesterday' : formatDay(day, { weekday: 'short', month: 'short', day: 'numeric' });
  return `<nav class="day-nav" aria-label="Choose a day to log">
    <button class="icon-btn" data-action="prev-day" aria-label="Previous day" ${day <= start ? 'disabled' : ''}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
    </button>
    <label class="day-pick">
      <span class="day-label">${esc(label)}</span>
      <input type="date" data-log-date value="${day}" min="${start}" max="${today}" aria-label="Pick a day to log">
    </label>
    <button class="icon-btn" data-action="next-day" aria-label="Next day" ${day >= today ? 'disabled' : ''}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
    </button>
  </nav>`;
}

function dayNavActions(day: string): Record<string, () => void> {
  const go = (d: string) => {
    const today = dateKey(new Date());
    location.hash = dayHash(logDay(d, today, db.data.settings!.startDate), today);
  };
  return { 'prev-day': () => go(addDays(day, -1)), 'next-day': () => go(addDays(day, 1)) };
}

/** Check-ins, meal and slip buttons, and the weigh-in form for one day. */
function logSectionsHtml(day: string, today: string): string {
  const s = db.data.settings!;
  const log = db.day(day);
  const isToday = day === today;
  const lastWeigh = [...db.data.weighIns].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const dayWeigh = db.data.weighIns.filter((w) => w.date === day).at(-1);
  const show = (kg: number) => `${toDisplay(kg, s.unit).toFixed(1)} ${s.unit}`;
  return `
    <section class="card" aria-labelledby="h-checklist">
      <h2 id="h-checklist" class="card-title">${isToday ? "Today's check-ins" : 'Check-ins'}</h2>
      <ul class="checklist">
        <li><label class="check">
          <input type="checkbox" id="kept" data-kept ${log.keptFast ? 'checked' : ''}>
          <span class="box" aria-hidden="true"></span>
          <span>Kept my fasting window</span>
        </label></li>
        ${s.habits
          .map(
            (h) => `<li><label class="check">
              <input type="checkbox" id="habit-${esc(h.id)}" data-habit="${esc(h.id)}" ${log.habitsDone.includes(h.id) ? 'checked' : ''}>
              <span class="box" aria-hidden="true"></span>
              <span>${esc(h.label)}</span>
            </label></li>`,
          )
          .join('')}
      </ul>
    </section>

    <div class="row gap">
      <button class="btn primary grow" data-action="meal">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        Log a meal
      </button>
      <button class="btn slip grow" data-action="slip">I slipped</button>
    </div>

    <section class="card" aria-labelledby="h-weigh">
      <h2 id="h-weigh" class="card-title">${isToday ? 'Quick weigh-in' : 'Weigh-in'}</h2>
      <form class="row gap weigh-form" data-weigh novalidate>
        <label class="field grow">
          <span class="sr-only">Weight in ${s.unit}</span>
          <input id="weight" name="weight" inputmode="decimal" autocomplete="off" placeholder="0.0" aria-describedby="weigh-hint">
        </label>
        <span class="unit">${s.unit}</span>
        <button class="btn primary" type="submit">Save</button>
      </form>
      <p id="weigh-hint" class="muted small">${
        !isToday
          ? dayWeigh
            ? `You logged ${show(dayWeigh.kg)} on this day. Saving again replaces it in your trend.`
            : 'No weigh-in on this day yet.'
          : lastWeigh
          ? `Last: ${show(lastWeigh.kg)} on ${esc(formatDay(lastWeigh.date, { month: 'short', day: 'numeric' }))}. The trend matters more than any single number.`
          : 'Weigh at the same time each morning for the clearest trend.'
      }</p>
    </section>
  `;
}

function wireLogSections(root: HTMLElement, day: string): void {
  const s = db.data.settings!;
  root.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    if (input.matches('[data-kept]')) {
      await db.updateDay(day, { keptFast: input.checked });
    } else if (input.dataset.habit) {
      const done = new Set(db.day(day).habitsDone);
      input.checked ? done.add(input.dataset.habit) : done.delete(input.dataset.habit);
      await db.updateDay(day, { habitsDone: [...done] });
    } else if (input.matches('[data-log-date]') && input.value) {
      const today = dateKey(new Date());
      location.hash = dayHash(logDay(input.value, today, s.startDate), today);
    }
  });

  root.querySelector<HTMLFormElement>('[data-weigh]')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const input = form.elements.namedItem('weight') as HTMLInputElement;
    const kg = parseWeight(input.value, s.unit);
    if (kg === null) {
      input.setAttribute('aria-invalid', 'true');
      toast(`Enter your weight in ${s.unit}`, 'info');
      input.focus();
      return;
    }
    await db.addWeighIn({ date: day, kg });
    toast('Weigh-in saved');
  });
}

// ---------------------------------------------------------------- past day

function renderPastDay(root: HTMLElement, day: string, today: string): () => void {
  const s = db.data.settings!;
  const st = streak(db.data, today);
  const meals = db.data.meals.filter((m) => m.date === day).length;
  const slips = db.data.slips.filter((x) => x.date === day).length;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

  root.innerHTML = `
    <header class="screen-head">
      <p class="eyebrow">${esc(formatDay(day))}</p>
      <h1>${day === addDays(today, -1) ? 'Yesterday' : esc(formatDay(day, { weekday: 'long' }))}</h1>
      ${streakChip(st.streak)}
    </header>

    ${dayNavHtml(day, today, s.startDate)}

    <section class="banner info past-banner" role="status">
      <strong>You're filling in a past day.</strong>
      <span>Anything you tick or log here is saved to ${esc(formatDay(day, { weekday: 'long', month: 'short', day: 'numeric' }))}, and your streak updates to match.</span>
      <button class="btn ghost small" data-action="back-today">Back to today</button>
    </section>

    ${logSectionsHtml(day, today)}

    <p class="muted small past-summary">${
      meals || slips
        ? `Logged on this day: ${[meals && plural(meals, 'meal'), slips && plural(slips, 'slip')].filter(Boolean).join(', ')}.
           <button class="link-btn" data-action="see-food">See them in Food</button>`
        : 'No meals or slips logged on this day.'
    }</p>
  `;

  onAction(root, {
    ...dayNavActions(day),
    meal: () => openMealSheet(day),
    slip: () => openSlipSheet(undefined, day),
    'see-food': () => openFoodDay(day),
    'back-today': () => (location.hash = '#/today'),
  });
  wireLogSections(root, day);
  return () => {};
}
