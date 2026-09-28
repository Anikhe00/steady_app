import * as db from '../lib/db';
import { clockTime, dateKey } from '../lib/dates';
import { fromDisplay } from '../lib/stats';
import { TRIGGER_LABELS, type MealType, type Portion, type SlipTrigger } from '../lib/types';
import { esc } from './dom';
import { compressPhoto } from './photo';
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
  let photo: Blob | null = null;
  let previewUrl: string | null = null;
  const s = openSheet(
    'Log a meal',
    `<form class="stack" novalidate>
      <fieldset class="field">
        <legend>Photo of your plate</legend>
        <div class="photo-pick" data-photo-box>
          <img alt="Your meal photo" data-preview hidden>
          <p class="muted small" data-photo-hint>A photo shows exactly what and how much you ate, so there's nothing to guess later.</p>
          <div class="row gap">
            <label class="btn primary grow photo-btn">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
              <span data-take-label>Take photo</span>
              <input type="file" accept="image/*" capture="environment" data-photo-input>
            </label>
            <label class="btn ghost grow photo-btn">
              <span>From gallery</span>
              <input type="file" accept="image/*" data-photo-input>
            </label>
          </div>
        </div>
      </fieldset>
      <label class="field">
        <span>What's in it? <span class="muted">(optional)</span></span>
        <input name="description" maxlength="200" autocomplete="off" placeholder="e.g. Rice, beans and plantain">
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
    () => previewUrl && URL.revokeObjectURL(previewUrl),
  );
  const form = s.body.querySelector('form')!;
  const preview = form.querySelector<HTMLImageElement>('[data-preview]')!;
  const hint = form.querySelector<HTMLElement>('[data-photo-hint]')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;

  form.querySelectorAll<HTMLInputElement>('[data-photo-input]').forEach((input) =>
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      submit.disabled = true;
      hint.textContent = 'Preparing photo…';
      try {
        photo = await compressPhoto(file);
      } catch {
        photo = null;
        hint.textContent = "That photo couldn't be read. Try taking it again.";
        submit.disabled = false;
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(photo);
      preview.src = previewUrl;
      preview.hidden = false;
      hint.hidden = true;
      form.querySelector('[data-take-label]')!.textContent = 'Retake';
      form.querySelector<HTMLElement>('.form-error')!.hidden = true;
      submit.disabled = false;
    }),
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!photo) {
      showError(form, 'Add a photo of your meal first.');
      form.querySelector<HTMLElement>('[data-photo-box]')!.scrollIntoView({ block: 'center' });
      return;
    }
    const f = new FormData(form);
    const type = f.get('type') as MealType;
    submit.disabled = true;
    try {
      await db.addMeal(
        {
          date: String(f.get('date')),
          time: String(f.get('time')),
          description: String(f.get('description') ?? '').trim(),
          type,
          portion: f.get('portion') as Portion,
          fullness: Number(f.get('fullness')) as 1 | 2 | 3 | 4 | 5,
          brokeFast: f.get('brokeFast') === 'on',
        },
        photo,
      );
    } catch {
      submit.disabled = false;
      showError(form, "Couldn't save. Your phone may be low on storage.");
      return;
    }
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
