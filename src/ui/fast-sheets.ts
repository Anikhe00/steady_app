import * as db from '../lib/db';
import { dateKey, formatDuration } from '../lib/dates';
import { latestFast, pastTime, toClock, upcomingTime, type FastState } from '../lib/fasting';
import { formatTime } from './dom';
import { openSheet, toast } from './sheet';

const HOUR = 3_600_000;

function sheetError(body: HTMLElement, msg: string) {
  const el = body.querySelector<HTMLElement>('.form-error')!;
  el.textContent = msg;
  el.hidden = false;
}

export function openEndFastSheet(state: FastState, eatingHours: number): void {
  const now = new Date();
  const start = state.start.getTime();
  const goalH = Math.round((state.target.getTime() - start) / HOUR);
  const summary = (end: number) => {
    const done = end - start;
    return done >= state.target.getTime() - start
      ? `You fasted <strong>${formatDuration(done)}</strong>. That's your ${goalH}h goal reached.`
      : `You fasted <strong>${formatDuration(done)}</strong> of your ${goalH}h goal. Ending early is okay. Listening to your body is part of the plan.`;
  };
  const s = openSheet(
    'End your fast',
    `<form class="stack">
      <p data-summary>${summary(now.getTime())}</p>
      <label class="field"><span>Fast ended at</span>
        <input type="time" name="end" value="${toClock(now)}" required>
      </label>
      <p class="muted small" data-window></p>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn primary block" type="submit">End fast</button>
    </form>`,
  );
  const form = s.body.querySelector('form')!;
  const input = form.elements.namedItem('end') as HTMLInputElement;
  const endAt = () => pastTime(new Date(), input.value || toClock(new Date())).getTime();
  const refresh = () => {
    const end = endAt();
    form.querySelector('[data-summary]')!.innerHTML = summary(end);
    form.querySelector('[data-window]')!.textContent =
      `Your eating window runs until ${formatTime(new Date(end + eatingHours * HOUR))}, then your next fast starts.`;
  };
  input.addEventListener('input', refresh);
  refresh();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const end = endAt();
    if (end <= start) return sheetError(s.body, `Your fast started at ${formatTime(state.start)}. Pick a time after that.`);
    await db.putFast({ id: state.fastId, start, end });
    if (end >= state.target.getTime()) await db.updateDay(dateKey(new Date(end)), { keptFast: true });
    s.close();
    toast(`Fast ended. Eat until ${formatTime(new Date(end + eatingHours * HOUR))}`);
  });
}

export function openEditStartSheet(state: FastState): void {
  const prev = latestFast(db.data.fasts.filter((f) => f.id !== state.fastId && f.end !== undefined));
  const s = openSheet(
    'Edit fast start',
    `<form class="stack">
      <p class="muted">When did you finish your last bite?</p>
      <label class="field"><span>Fast started at</span>
        <input type="time" name="start" value="${toClock(state.start)}" required>
      </label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn primary block" type="submit">Save</button>
    </form>`,
  );
  const form = s.body.querySelector('form')!;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const start = pastTime(new Date(), String(new FormData(form).get('start'))).getTime();
    if (prev?.end && start < prev.end) {
      return sheetError(s.body, `Your last fast ended at ${formatTime(new Date(prev.end))}. Pick a time after that.`);
    }
    await db.putFast({ id: state.fastId, start });
    s.close();
    toast(`Fast start set to ${formatTime(new Date(start))}`);
  });
}

export async function startFastNow(): Promise<void> {
  await db.putFast({ start: Date.now() });
  toast('Fast started');
}

export function openMoveNextFastSheet(state: FastState): void {
  const last = db.data.fasts.find((f) => f.id === state.fastId);
  if (!last?.end) return;
  const s = openSheet(
    'Move your next fast',
    `<form class="stack">
      <p class="muted">Late dinner or a family event? Move when your next fast starts. This is planning ahead, not failing.</p>
      <label class="field"><span>Next fast starts at</span>
        <input type="time" name="next" value="${toClock(state.end)}" required>
      </label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn primary block" type="submit">Save</button>
    </form>`,
  );
  const form = s.body.querySelector('form')!;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const next = upcomingTime(new Date(last.end!), String(new FormData(form).get('next'))).getTime();
    await db.putFast({ ...last, nextStart: next });
    s.close();
    toast(`Next fast starts at ${formatTime(new Date(next))}`);
  });
}
