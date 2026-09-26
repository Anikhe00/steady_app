import * as db from '../lib/db';
import { clockTime, dateKey } from '../lib/dates';
import { fromDisplay } from '../lib/stats';
import { TRIGGER_LABELS, type MealType, type Portion, type SlipTrigger } from '../lib/types';
import { esc, formatClock } from './dom';
import { openSheet, toast } from './sheet';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const PORTIONS: Portion[] = ['small', 'medium', 'large'];
const FULLNESS = ['Still hungry', 'Light', 'Satisfied', 'Full', 'Stuffed'];

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function guessMealType(time: string): MealType {
  const h = Number(time.slice(0, 2));
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

function chips(name: string, options: { value: string; label: string }[], selected: string): string {
  return `<div class="chips" role="radiogroup">${options
    .map(
      (o) => `<label class="chip"><input type="radio" name="${name}" value="${esc(o.value)}"
        ${o.value === selected ? 'checked' : ''} required><span>${esc(o.label)}</span></label>`,
    )
    .join('')}</div>`;
}

export function openMealSheet(date = dateKey(new Date())): void {
  const now = clockTime(new Date());
  const firstOfDay = !db.data.meals.some((m) => m.date === date);
  const s = openSheet(
    'Log a meal',
    `<form class="stack" novalidate>
      <label class="field">
        <span>What did you eat?</span>
        <input name="description" required maxlength="200" autocomplete="off" placeholder="e.g. Rice, beans and plantain">
      </label>
      <fieldset class="field"><legend>Meal</legend>
        ${chips('type', MEAL_TYPES.map((t) => ({ value: t, label: cap(t) })), guessMealType(now))}
      </fieldset>
      <div class="row gap">
        <label class="field grow"><span>Time</span><input type="time" name="time" value="${now}" required></label>
        <label class="field grow"><span>Day</span><input type="date" name="date" value="${date}" required></label>
      </div>
      <fieldset class="field"><legend>Portion</legend>
        ${chips('portion', PORTIONS.map((p) => ({ value: p, label: cap(p) })), 'medium')}
      </fieldset>
      <fieldset class="field"><legend>How full do you feel?</legend>
        ${chips('fullness', FULLNESS.map((l, i) => ({ value: String(i + 1), label: `${i + 1} · ${l}` })), '3')}
      </fieldset>
      <label class="toggle">
        <input type="checkbox" name="brokeFast" ${firstOfDay ? 'checked' : ''}>
        <span>This broke my fast</span>
      </label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn primary block" type="submit">Save meal</button>
    </form>`,
  );
  const form = s.body.querySelector('form')!;
  const desc = form.elements.namedItem('description') as HTMLInputElement;
  desc.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const description = String(f.get('description') ?? '').trim();
    if (!description) {
      showError(form, 'Add a short description of the meal.');
      desc.focus();
      return;
    }
    await db.addMeal({
      date: String(f.get('date')),
      time: String(f.get('time')),
      description,
      type: f.get('type') as MealType,
      portion: f.get('portion') as Portion,
      fullness: Number(f.get('fullness')) as 1 | 2 | 3 | 4 | 5,
      brokeFast: f.get('brokeFast') === 'on',
    });
    s.close();
    toast('Meal logged');
  });
}

const SLIP_REPLIES: Record<SlipTrigger, string> = {
  stress: 'Stress eating is your body asking for comfort. Noticing it is the skill.',
  boredom: 'Boredom is sneaky. Now you know one of its times of day.',
  tired: 'Tired bodies look for fast energy. Rest counts as part of the plan.',
  social: 'Sharing food with people matters too. The next meal is a fresh start.',
  hungry: 'Very hungry usually means the plan needs a little more food earlier, not more willpower.',
  cravings: 'Cravings pass. You logged this one, which is how you learn their pattern.',
  other: 'Whatever it was, writing it down is the step most people skip.',
};

export function openSlipSheet(onSaved?: () => void): void {
  const s = openSheet(
    'I slipped',
    `<form class="stack">
      <p class="muted">That's okay. One slip is one moment, not the whole day. What was going on?</p>
      <fieldset class="field"><legend>What set it off?</legend>
        ${chips('trigger', Object.entries(TRIGGER_LABELS).map(([value, label]) => ({ value, label })), '')}
      </fieldset>
      <label class="field"><span>Note (optional)</span>
        <textarea name="note" rows="2" maxlength="300" placeholder="Anything you want future-you to know"></textarea>
      </label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn primary block" type="submit">Log it and move on</button>
    </form>`,
  );
  const form = s.body.querySelector('form')!;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const trigger = f.get('trigger') as SlipTrigger | null;
    if (!trigger) {
      showError(form, 'Pick whichever trigger fits best, or "Other".');
      return;
    }
    const now = new Date();
    const note = String(f.get('note') ?? '').trim();
    await db.addSlip({ date: dateKey(now), time: clockTime(now), trigger, ...(note ? { note } : {}) });
    s.body.innerHTML = `
      <div class="stack center">
        <p class="big-reply">${esc(SLIP_REPLIES[trigger])}</p>
        <p class="muted">Your next choice is the one that counts. Never miss twice.</p>
        <button class="btn primary block" type="button" data-close>Back to today</button>
      </div>`;
    onSaved?.();
  });
}

export function openShiftSheet(date: string, usual: string, current: string): void {
  const s = openSheet(
    "Shift today's window",
    `<form class="stack">
      <p class="muted">Late dinner or a family event? Move today's eating window. This is planning ahead, not failing.</p>
      <label class="field"><span>Window opens at</span>
        <input type="time" name="start" value="${current}" required>
      </label>
      <p class="muted small">Your usual start is ${esc(formatClock(usual))}. Tomorrow goes back to it.</p>
      <div class="row gap">
        ${current !== usual ? '<button class="btn ghost grow" type="button" data-reset>Use usual time</button>' : ''}
        <button class="btn primary grow" type="submit">Shift window</button>
      </div>
    </form>`,
  );
  const form = s.body.querySelector('form')!;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const start = String(new FormData(form).get('start'));
    await db.updateDay(date, { shiftedStart: start === usual ? undefined : start });
    s.close();
    toast(`Today's window opens at ${formatClock(start)}`);
  });
  s.body.querySelector('[data-reset]')?.addEventListener('click', async () => {
    await db.updateDay(date, { shiftedStart: undefined });
    s.close();
    toast('Back to your usual window');
  });
}

/** Parses a weigh-in form value; returns kg or null. */
export function parseWeight(raw: string, unit: 'kg' | 'lb'): number | null {
  const v = Number(raw.replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  const kg = fromDisplay(v, unit);
  return kg >= 20 && kg <= 400 ? Math.round(kg * 100) / 100 : null;
}

function showError(form: HTMLFormElement, msg: string) {
  const el = form.querySelector<HTMLElement>('.form-error')!;
  el.textContent = msg;
  el.hidden = false;
}
