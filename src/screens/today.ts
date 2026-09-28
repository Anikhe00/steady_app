import * as db from '../lib/db';
import { addDays, dateKey, fastStartFromWindow, formatDuration } from '../lib/dates';
import { fastState } from '../lib/fasting';
import { dayCounted, streak, toDisplay } from '../lib/stats';
import { EATING_HOURS, type Settings } from '../lib/types';
import { esc, formatDay, formatTime, onAction } from '../ui/dom';
import { openEditStartSheet, openEndFastSheet, openMoveNextFastSheet, startFastNow } from '../ui/fast-sheets';
import { openMealSheet, openSlipSheet, parseWeight } from '../ui/forms';
import { STAGES } from '../lib/stages';
import { ringHtml, stageSheetHtml, updateRing } from '../ui/ring';
import { openSheet, toast } from '../ui/sheet';

const stateNow = (s: Settings, now = new Date()) =>
  fastState(now, db.data.fasts, EATING_HOURS[s.plan], fastStartFromWindow(s.windowStart, EATING_HOURS[s.plan]));

export function renderToday(root: HTMLElement): () => void {
  const s = db.data.settings!;
  const today = dateKey(new Date());
  const yesterday = addDays(today, -1);
  const log = db.day(today);
  const st = streak(db.data, today);
  const slippedToday = db.data.slips.some((x) => x.date === today);
  const missedYesterday = st.missedYesterday && yesterday >= s.startDate;
  const lastWeigh = [...db.data.weighIns].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const initial = stateNow(s);

  root.innerHTML = `
    <header class="screen-head">
      <p class="eyebrow">${esc(formatDay(today))}</p>
      <h1>Today</h1>
      <p class="streak-chip" aria-label="Streak: ${st.streak} days">
        <span aria-hidden="true">●</span> ${st.streak} day${st.streak === 1 ? '' : 's'} steady
      </p>
    </header>

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
          ? `<button class="btn primary block" data-action="end-fast">End fast</button>
             <button class="btn ghost small" data-action="edit-start">Edit start time</button>`
          : `<div class="row gap fast-actions">
               <button class="btn ghost small grow" data-action="move-next">Move next fast</button>
               <button class="btn ghost small grow" data-action="start-now">Start fast now</button>
             </div>`
      }
    </section>

    <section class="card" aria-labelledby="h-checklist">
      <h2 id="h-checklist" class="card-title">Today's check-ins</h2>
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
      <h2 id="h-weigh" class="card-title">Quick weigh-in</h2>
      <form class="row gap weigh-form" data-weigh novalidate>
        <label class="field grow">
          <span class="sr-only">Weight in ${s.unit}</span>
          <input id="weight" name="weight" inputmode="decimal" autocomplete="off" placeholder="0.0" aria-describedby="weigh-hint">
        </label>
        <span class="unit">${s.unit}</span>
        <button class="btn primary" type="submit">Save</button>
      </form>
      <p id="weigh-hint" class="muted small">${
        lastWeigh
          ? `Last: ${toDisplay(lastWeigh.kg, s.unit).toFixed(1)} ${s.unit} on ${esc(formatDay(lastWeigh.date, { month: 'short', day: 'numeric' }))}. The trend matters more than any single number.`
          : 'Weigh at the same time each morning for the clearest trend.'
      }</p>
    </section>
  `;

  onAction(root, {
    'end-fast': () => openEndFastSheet(stateNow(s), EATING_HOURS[s.plan]),
    'edit-start': () => openEditStartSheet(stateNow(s)),
    'move-next': () => openMoveNextFastSheet(stateNow(s)),
    'start-now': () => startFastNow(),
    meal: () => openMealSheet(today),
    slip: () => openSlipSheet(),
    stage: (el) => {
      const st = STAGES.find((x) => x.id === el.dataset.stage);
      if (!st) return;
      openSheet(`<span aria-hidden="true">${st.icon}</span> ${esc(st.title)}`, stageSheetHtml(st, stateNow(s)));
    },
  });

  root.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    if (input.matches('[data-kept]')) {
      await db.updateDay(today, { keptFast: input.checked });
    } else if (input.dataset.habit) {
      const done = new Set(db.day(today).habitsDone);
      input.checked ? done.add(input.dataset.habit) : done.delete(input.dataset.habit);
      await db.updateDay(today, { habitsDone: [...done] });
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
    await db.addWeighIn({ date: today, kg });
    toast('Weigh-in saved');
  });

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
    line.textContent =
      state.phase === 'fasting'
        ? state.over
          ? `Goal of ${s.plan.split(':')[0]}h reached. End your fast whenever you're ready.`
          : `Goal: ${s.plan} fast. Your eating window starts when you end it.`
        : `Eat until ${formatTime(state.end)}. Your next fast starts then.`;
    const soon = state.phase === 'eating' && state.remainingMs <= 3_600_000;
    closing.hidden = !soon;
    if (soon) closing.textContent = `Your eating window closes in ${formatDuration(state.remainingMs)}.`;
  };
  tick();
  const timer = window.setInterval(tick, 1000);
  return () => clearInterval(timer);
}
