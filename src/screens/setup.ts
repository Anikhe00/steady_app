import * as db from '../lib/db';
import { backupFileName, makeBackup, readBackup } from '../lib/backup';
import { addClock, dateKey, fastStartFromWindow, parseClock, scheduleFromFastStart } from '../lib/dates';
import { everyDayPlan, ramadanPreset, sunnahPreset, WEEKDAYS } from '../lib/schedule';
import { isIos, isStandalone, notificationsSupported, requestPermission } from '../lib/reminders';
import { EATING_HOURS, type DayPlan, type FastingPlan, type Settings, type WeightUnit } from '../lib/types';
import { esc, formatClock, onAction } from '../ui/dom';
import { blobToDataUrl, dataUrlToBlob } from '../ui/photo';
import { confirmSheet, toast } from '../ui/sheet';

const PLANS: { value: FastingPlan; label: string; hint: string }[] = [
  { value: '14:10', label: '14:10', hint: 'Gentle start' },
  { value: '16:8', label: '16:8', hint: 'Most common' },
  { value: '18:6', label: '18:6', hint: 'Stronger' },
  { value: '20:4', label: '20:4', hint: 'Aggressive' },
];
const SUGGESTIONS = ['Walked 20 minutes', 'Drank 2L of water', 'Veg with lunch', 'In bed by 11', 'No sugary drinks'];

const PRESETS: Record<string, () => DayPlan[]> = {
  sunnah: () => sunnahPreset(),
  ramadan: () => ramadanPreset(),
  usual: everyDayPlan,
};

/** "Monday 8:00 PM to Tuesday 2:00 PM (18h)" */
function customSummary(day: number, start: string, hours: number): string {
  const { h, m } = parseClock(start);
  const days = Math.floor((h * 60 + m + hours * 60) / 1440);
  const endDay = days === 0 ? '' : `${WEEKDAYS[(day + days) % 7]} `;
  return `${WEEKDAYS[day]} ${formatClock(start)} to ${endDay}${formatClock(addClock(start, hours))} (${hours}h)`;
}

function dayRowHtml(p: DayPlan, i: number, fallback: { start: string; hours: number }): string {
  const c = p.kind === 'custom' ? p : { start: fallback.start, hours: fallback.hours, dry: false };
  return `<li class="day-plan" data-day="${i}">
    <label class="day-row">
      <span class="day-name">${WEEKDAYS[i]}</span>
      <select name="kind-${i}" data-kind>
        <option value="plan" ${p.kind === 'plan' ? 'selected' : ''}>Usual plan</option>
        <option value="custom" ${p.kind === 'custom' ? 'selected' : ''}>Custom fast</option>
        <option value="rest" ${p.kind === 'rest' ? 'selected' : ''}>Rest day</option>
      </select>
    </label>
    <div class="day-custom stack" ${p.kind === 'custom' ? '' : 'hidden'}>
      <div class="row gap">
        <label class="field grow"><span>Starts</span>
          <input type="time" name="start-${i}" value="${esc(c.start)}">
        </label>
        <label class="field grow"><span>Hours</span>
          <input type="number" name="hours-${i}" value="${c.hours}" min="1" max="72" step="0.5" inputmode="decimal">
        </label>
      </div>
      <label class="toggle">
        <input type="checkbox" name="dry-${i}" ${c.dry ? 'checked' : ''}>
        <span>Dry fast (no food or water)</span>
      </label>
      <p class="muted small" data-summary></p>
    </div>
  </li>`;
}

function reminderNote(): string {
  if (notificationsSupported()) {
    if (Notification.permission === 'denied') return 'Notifications are blocked for this app in your phone settings.';
    return 'Fires 1 hour before your window closes, while Steady is open or in the background.';
  }
  if (isIos() && !isStandalone()) return 'On iPhone, add Steady to your Home Screen first, then turn this on.';
  return "This browser can't show notifications. You'll see a banner on Today instead.";
}

export function renderSetup(root: HTMLElement, onboarding: boolean, onDone: () => void): void {
  const s: Settings = db.data.settings ?? {
    why: '',
    plan: '16:8',
    windowStart: '12:00', // fast starts 8 PM on 16:8
    habits: [],
    unit: 'kg',
    remindersOn: false,
    startDate: dateKey(new Date()),
  };
  const habitVals = [0, 1, 2].map((i) => s.habits[i]?.label ?? '');

  root.innerHTML = `
    <header class="screen-head">
      <p class="eyebrow">${onboarding ? 'Welcome to Steady' : 'Setup'}</p>
      <h1>${onboarding ? "Let's set you up" : 'Your plan'}</h1>
      ${onboarding ? '<p class="muted">Two minutes now. Steady is built for getting back on track after a bad day, not for perfect streaks.</p>' : ''}
    </header>

    <form class="stack" data-setup novalidate>
      <section class="card stack">
        <label class="field">
          <span class="card-title">My why</span>
          <span class="muted small">A short reason in your own words. Steady shows it to you after a missed day or a slip.</span>
          <textarea name="why" rows="3" maxlength="280" required placeholder="e.g. I want to keep up with my kids at the park">${esc(s.why)}</textarea>
        </label>
      </section>

      <section class="card stack">
        <fieldset class="field">
          <legend class="card-title">Fasting plan</legend>
          <div class="plans">
            ${(s.plan === '12:12' ? [{ value: '12:12' as const, label: '12:12', hint: 'Your current plan' }, ...PLANS] : PLANS).map(
              (p) => `<label class="plan">
                <input type="radio" name="plan" value="${p.value}" ${s.plan === p.value ? 'checked' : ''}>
                <span><strong>${p.label}</strong><small>${p.hint}</small></span>
              </label>`,
            ).join('')}
          </div>
        </fieldset>
        <label class="field">
          <span>I start fasting at</span>
          <input type="time" name="fastStart" value="${esc(fastStartFromWindow(s.windowStart, EATING_HOURS[s.plan]))}" required>
        </label>
        <dl class="schedule" data-schedule aria-live="polite"></dl>
      </section>

      <section class="card stack">
        <fieldset class="field">
          <legend class="card-title">Weekly schedule</legend>
          <span class="muted small">Choose each day's fast. A fast belongs to the day it starts, so a Monday night fast can run into Tuesday. Rest days never count as a miss.</span>
          <div class="chips suggestions" aria-label="Presets">
            <button type="button" class="chip-btn" data-action="preset" data-preset="sunnah">Sunnah Mon &amp; Thu</button>
            <button type="button" class="chip-btn" data-action="preset" data-preset="ramadan">Ramadan</button>
            <button type="button" class="chip-btn" data-action="preset" data-preset="usual">Usual plan every day</button>
          </div>
          <ul class="week-plan" data-week></ul>
        </fieldset>
      </section>

      <section class="card stack">
        <fieldset class="field">
          <legend class="card-title">Daily habits</legend>
          <span class="muted small">Pick 2 or 3 small things you can do on a bad day too.</span>
          ${habitVals
            .map(
              (v, i) => `<label class="field">
                <span class="sr-only">Habit ${i + 1}${i === 2 ? ' (optional)' : ''}</span>
                <input name="habit" value="${esc(v)}" maxlength="40" autocomplete="off"
                  placeholder="${i === 2 ? 'Third habit (optional)' : `Habit ${i + 1}`}">
              </label>`,
            )
            .join('')}
          <div class="chips suggestions" aria-label="Suggestions">
            ${SUGGESTIONS.map((x) => `<button type="button" class="chip-btn" data-action="suggest" data-value="${esc(x)}">+ ${esc(x)}</button>`).join('')}
          </div>
        </fieldset>
      </section>

      <section class="card stack">
        <fieldset class="field">
          <legend class="card-title">Weight unit</legend>
          <div class="chips">
            ${(['kg', 'lb'] as WeightUnit[])
              .map((u) => `<label class="chip"><input type="radio" name="unit" value="${u}" ${s.unit === u ? 'checked' : ''}><span>${u}</span></label>`)
              .join('')}
          </div>
        </fieldset>
        <label class="toggle">
          <input type="checkbox" name="remindersOn" ${s.remindersOn ? 'checked' : ''}>
          <span>Remind me before my window closes</span>
        </label>
        <p class="muted small" data-reminder-note>${esc(reminderNote())}</p>
      </section>

      <p class="form-error" role="alert" hidden></p>
      <button class="btn primary block" type="submit">${onboarding ? 'Start Steady' : 'Save changes'}</button>
    </form>

    ${
      onboarding
        ? `<p class="center small"><button class="link-btn" data-action="restore">Restore from a backup instead</button></p>`
        : `<section class="card stack" aria-labelledby="h-backup">
            <h2 id="h-backup" class="card-title">Backup</h2>
            <p class="muted small">Your data lives only on this phone. Save a backup now and then, for example to Files or Google Drive.</p>
            <div class="row gap">
              <button class="btn ghost grow" data-action="export">Export backup</button>
              <button class="btn ghost grow" data-action="restore">Restore</button>
            </div>
          </section>`
    }
    <input type="file" accept="application/json,.json" data-file hidden>
  `;

  const form = root.querySelector<HTMLFormElement>('[data-setup]')!;
  const error = form.querySelector<HTMLElement>('.form-error')!;
  const fileInput = root.querySelector<HTMLInputElement>('[data-file]')!;

  onAction(root, {
    suggest: (el) => {
      const inputs = [...form.querySelectorAll<HTMLInputElement>('input[name="habit"]')];
      const empty = inputs.find((i) => !i.value.trim());
      if (empty) {
        empty.value = el.dataset.value!;
      } else {
        toast('You already have 3 habits. Clear one to swap it.', 'info');
      }
    },
    preset: (el) => {
      renderWeek(PRESETS[el.dataset.preset!]());
      const muslim = el.dataset.preset !== 'usual';
      toast(muslim ? `Suhoor ${formatClock('05:00')} to Iftar ${formatClock('19:00')}. Adjust to your times, then save.` : 'Schedule updated. Save to keep it.', 'info');
    },
    export: () => exportBackup(),
    restore: () => fileInput.click(),
  });

  // The fast start is what you set; the rest of the day follows from the plan.
  const schedule = () => {
    const plan = (form.querySelector<HTMLInputElement>('input[name="plan"]:checked')?.value ?? '16:8') as FastingPlan;
    return scheduleFromFastStart(form.fastStart.value || '20:00', EATING_HOURS[plan]);
  };
  const showSchedule = () => {
    const d = schedule();
    const t = (x: string) => esc(formatClock(x));
    root.querySelector('[data-schedule]')!.innerHTML = `
      <div><dt>Fast</dt><dd>${t(d.fastStart)} to ${t(d.fastEnd)} <span class="muted">(${d.fastingHours}h)</span></dd></div>
      <div><dt>Eating</dt><dd>${t(d.fastEnd)} to ${t(d.windowClose)} <span class="muted">(${24 - d.fastingHours}h)</span></dd></div>
      <div><dt>Next fast starts</dt><dd>${t(d.nextFastStart)}</dd></div>`;
  };
  form.fastStart.addEventListener('input', showSchedule);
  form.querySelectorAll('input[name="plan"]').forEach((el) => el.addEventListener('change', showSchedule));
  showSchedule();

  // Weekly schedule: one row per weekday; custom rows show their own fields.
  const weekList = root.querySelector<HTMLElement>('[data-week]')!;
  const renderWeek = (week: DayPlan[]) => {
    const d = schedule();
    weekList.innerHTML = week.map((p, i) => dayRowHtml(p, i, { start: d.fastStart, hours: d.fastingHours })).join('');
    weekList.querySelectorAll<HTMLElement>('.day-plan').forEach(refreshDay);
  };
  const refreshDay = (li: HTMLElement) => {
    const i = Number(li.dataset.day);
    const custom = li.querySelector<HTMLSelectElement>('[data-kind]')!.value === 'custom';
    li.querySelector<HTMLElement>('.day-custom')!.hidden = !custom;
    const start = li.querySelector<HTMLInputElement>(`[name="start-${i}"]`)!.value;
    const hours = Number(li.querySelector<HTMLInputElement>(`[name="hours-${i}"]`)!.value);
    li.querySelector<HTMLElement>('[data-summary]')!.textContent = start && hours > 0 ? customSummary(i, start, hours) : '';
  };
  const readWeek = (): DayPlan[] | string => {
    const out: DayPlan[] = [];
    for (let i = 0; i < 7; i++) {
      const kind = (form.elements.namedItem(`kind-${i}`) as HTMLSelectElement).value;
      if (kind !== 'custom') {
        out.push({ kind: kind === 'rest' ? 'rest' : 'plan' });
        continue;
      }
      const start = (form.elements.namedItem(`start-${i}`) as HTMLInputElement).value;
      const hours = Number((form.elements.namedItem(`hours-${i}`) as HTMLInputElement).value);
      if (!start) return `Set a start time for ${WEEKDAYS[i]}'s fast.`;
      if (!(hours >= 1 && hours <= 72)) return `${WEEKDAYS[i]}'s fast needs a length between 1 and 72 hours.`;
      out.push({ kind: 'custom', start, hours, dry: (form.elements.namedItem(`dry-${i}`) as HTMLInputElement).checked });
    }
    return out;
  };
  weekList.addEventListener('input', (e) => refreshDay((e.target as HTMLElement).closest<HTMLElement>('.day-plan')!));
  weekList.addEventListener('change', (e) => refreshDay((e.target as HTMLElement).closest<HTMLElement>('.day-plan')!));
  renderWeek(s.week ?? everyDayPlan());

  form.remindersOn.addEventListener('change', async () => {
    if (!form.remindersOn.checked) return;
    const result = await requestPermission();
    if (result !== 'granted') {
      form.remindersOn.checked = false;
      toast(result === 'unsupported' ? "Notifications aren't available here" : 'Notifications not allowed', 'info');
    }
    root.querySelector('[data-reminder-note]')!.textContent = reminderNote();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const why = String(f.get('why') ?? '').trim();
    const labels = f.getAll('habit').map((v) => String(v).trim()).filter(Boolean);
    const fail = (msg: string, field?: Element | null) => {
      error.textContent = msg;
      error.hidden = false;
      (field as HTMLElement | null)?.focus();
    };
    if (!why) return fail('Write a short "why". It\'s what you\'ll see on a hard day.', form.why);
    if (labels.length < 2) return fail('Add at least 2 habits.', form.querySelector('input[name="habit"]'));
    const week = readWeek();
    if (typeof week === 'string') return fail(week, weekList);
    error.hidden = true;

    // Keep ids stable for habits whose label didn't change, so history stays attached.
    const habits = labels.map((label) => s.habits.find((h) => h.label === label) ?? { id: db.uid(), label });
    await db.saveSettings({
      ...s,
      why,
      plan: (f.get('plan') as FastingPlan | null) ?? '16:8',
      windowStart: schedule().fastEnd,
      habits,
      unit: f.get('unit') as WeightUnit,
      remindersOn: f.get('remindersOn') === 'on',
      week,
    });
    toast(onboarding ? "You're set. Day one starts now." : 'Saved');
    onDone();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return toast("That file isn't a readable backup", 'info');
    }
    const r = readBackup(parsed);
    if (!r.ok) return toast(r.error, 'info');
    const counts = `${r.data.meals.length} meals (${Object.keys(r.photos).length} photos), ${r.data.slips.length} slips, ${r.data.weighIns.length} weigh-ins`;
    const ok = await confirmSheet(
      'Restore this backup?',
      `It contains ${esc(counts)}. Everything currently in Steady on this phone will be replaced.`,
      'Replace my data',
      true,
    );
    if (!ok) return;
    try {
      const photos: Record<string, Blob> = {};
      for (const [id, url] of Object.entries(r.photos)) photos[id] = await dataUrlToBlob(url);
      await db.replaceAll(r.data, photos);
    } catch {
      return toast("Couldn't restore. Your phone may be low on storage.", 'info');
    }
    toast('Backup restored');
    onDone();
  });
}

async function exportBackup(): Promise<void> {
  const name = backupFileName();
  const photos: Record<string, string> = {};
  for (const [id, blob] of Object.entries(await db.allPhotos())) photos[id] = await blobToDataUrl(blob);
  const json = JSON.stringify(makeBackup(db.data, photos));
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Steady backup' });
      return;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup downloaded');
}
