import * as db from '../lib/db';
import { backupFileName, makeBackup, readBackup } from '../lib/backup';
import { dateKey } from '../lib/dates';
import { isIos, isStandalone, notificationsSupported, requestPermission } from '../lib/reminders';
import type { FastingPlan, Settings, WeightUnit } from '../lib/types';
import { esc, onAction } from '../ui/dom';
import { confirmSheet, toast } from '../ui/sheet';

const PLANS: { value: FastingPlan; label: string; hint: string }[] = [
  { value: '12:12', label: '12:12', hint: 'Gentle start' },
  { value: '14:10', label: '14:10', hint: 'Middle ground' },
  { value: '16:8', label: '16:8', hint: 'Most common' },
];
const SUGGESTIONS = ['Walked 20 minutes', 'Drank 2L of water', 'Veg with lunch', 'In bed by 11', 'No sugary drinks'];

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
    windowStart: '12:00',
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
            ${PLANS.map(
              (p) => `<label class="plan">
                <input type="radio" name="plan" value="${p.value}" ${s.plan === p.value ? 'checked' : ''}>
                <span><strong>${p.label}</strong><small>${p.hint}</small></span>
              </label>`,
            ).join('')}
          </div>
        </fieldset>
        <label class="field">
          <span>Eating window starts at</span>
          <input type="time" name="windowStart" value="${esc(s.windowStart)}" required>
        </label>
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
    export: () => exportBackup(),
    restore: () => fileInput.click(),
  });

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
    error.hidden = true;

    // Keep ids stable for habits whose label didn't change, so history stays attached.
    const habits = labels.map((label) => s.habits.find((h) => h.label === label) ?? { id: db.uid(), label });
    await db.saveSettings({
      ...s,
      why,
      plan: f.get('plan') as FastingPlan,
      windowStart: String(f.get('windowStart') || '12:00'),
      habits,
      unit: f.get('unit') as WeightUnit,
      remindersOn: f.get('remindersOn') === 'on',
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
    const counts = `${r.data.meals.length} meals, ${r.data.slips.length} slips, ${r.data.weighIns.length} weigh-ins`;
    const ok = await confirmSheet(
      'Restore this backup?',
      `It contains ${esc(counts)}. Everything currently in Steady on this phone will be replaced.`,
      'Replace my data',
      true,
    );
    if (!ok) return;
    await db.replaceAll(r.data);
    toast('Backup restored');
    onDone();
  });
}

async function exportBackup(): Promise<void> {
  const name = backupFileName();
  const json = JSON.stringify(makeBackup(db.data), null, 2);
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
