import * as db from '../lib/db';
import { dateKey, formatDuration } from '../lib/dates';
import { latestFast, nearestTime, pastTime, toClock, upcomingTime, type FastState } from '../lib/fasting';
import { goalFor, nextFastAfter, type Schedule } from '../lib/schedule';
import { formatTime } from './dom';
import { openSheet, toast } from './sheet';

const HOUR = 3_600_000;

function sheetError(body: HTMLElement, msg: string) {
  const el = body.querySelector<HTMLElement>('.form-error')!;
  el.textContent = msg;
  el.hidden = false;
}

export function openEndFastSheet(state: FastState, sched: Schedule): void {
  const now = new Date();
  const start = state.start.getTime();
  const goal = formatDuration(state.goalHours * HOUR);
  const summary = (end: number) => {
    const done = end - start;
    return done >= state.target.getTime() - start
      ? `You fasted <strong>${formatDuration(done)}</strong>. That's your ${goal} goal reached.`
      : `You fasted <strong>${formatDuration(done)}</strong> of your ${goal} goal. Ending early is okay. Listening to your body is part of the plan.`;
  };
  const verb = state.dry ? 'Break' : 'End';
  const s = openSheet(
    `${verb} your fast`,
    `<form class="stack">
      <p data-summary>${summary(now.getTime())}</p>
      <label class="field"><span>Fast ended at</span>
        <input type="time" name="end" value="${toClock(now)}" required>
      </label>
      <p class="muted small" data-window></p>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn primary block" type="submit">${verb} fast</button>
    </form>`,
  );
  const form = s.body.querySelector('form')!;
  const input = form.elements.namedItem('end') as HTMLInputElement;
  const endAt = () => pastTime(new Date(), input.value || toClock(new Date())).getTime();
  const refresh = () => {
    const end = endAt();
    form.querySelector('[data-summary]')!.innerHTML = summary(end);
    const next = nextFastAfter(sched, end);
    form.querySelector('[data-window]')!.textContent =
      `Your eating window runs until ${dayTime(new Date(next.start), new Date(end))}, then your next fast starts${next.dry ? ' (a dry fast)' : ''}.`;
  };
  input.addEventListener('input', refresh);
  refresh();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const end = endAt();
    if (end <= start) return sheetError(s.body, `Your fast started at ${formatTime(state.start)}. Pick a time after that.`);
    await db.putFast({ id: state.fastId, start, end, goalHours: state.goalHours, dry: state.dry });
    if (end >= state.target.getTime()) await db.updateDay(dateKey(new Date(end)), { keptFast: true });
    s.close();
    toast(`Fast ended. Eat until ${dayTime(new Date(nextFastAfter(sched, end).start), new Date(end))}`);
  });
}

/** "at 11:25", or "yesterday at 11:25" / "tomorrow at 11:25" when not today. */
export function dayTime(d: Date, now = new Date()): string {
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  const day = diff === 0 ? '' : diff === -1 ? 'yesterday ' : diff === 1 ? 'tomorrow ' : `${d.toLocaleDateString(undefined, { weekday: 'short' })} `;
  return `${day}at ${formatTime(d)}`;
}

export function openEditStartSheet(state: FastState): void {
  const prev = latestFast(db.data.fasts.filter((f) => f.id !== state.fastId && f.end !== undefined));
  const s = openSheet(
    'Edit fast start',
    `<form class="stack">
      <p class="muted">When did you finish your last bite? You can also pick a time later today if you haven't started yet.</p>
      <label class="field"><span>Fast starts at</span>
        <input type="time" name="start" value="${toClock(state.start)}" required>
      </label>
      <p class="muted small" data-when></p>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn primary block" type="submit">Save</button>
    </form>`,
  );
  const form = s.body.querySelector('form')!;
  const input = form.elements.namedItem('start') as HTMLInputElement;
  const startAt = () => nearestTime(new Date(), input.value || toClock(state.start));
  const when = form.querySelector<HTMLElement>('[data-when]')!;
  const refresh = () => {
    const d = startAt();
    when.textContent = d > new Date() ? `Your fast will start ${dayTime(d)}. Until then you're in your eating window.` : `Fast started ${dayTime(d)}.`;
  };
  input.addEventListener('input', refresh);
  refresh();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const start = startAt().getTime();
    if (prev?.end && start < prev.end) {
      return sheetError(s.body, `Your last fast ended ${dayTime(new Date(prev.end))}. Pick a time after that.`);
    }
    await db.putFast({ id: state.fastId, start, goalHours: state.goalHours, dry: state.dry });
    s.close();
    toast(`Fast starts ${dayTime(new Date(start))}`);
  });
}

export async function startFastNow(sched: Schedule): Promise<void> {
  // A fast already set for later just starts now instead.
  const now = Date.now();
  const scheduled = db.data.fasts.find((f) => f.end === undefined && f.start > now);
  const { hours, dry } = goalFor(sched, now);
  await db.putFast(scheduled ? { ...scheduled, start: now } : { start: now, goalHours: hours, dry });
  toast('Fast started');
}

export function openMoveNextFastSheet(state: FastState): void {
  const last = db.data.fasts.find((f) => f.id === state.fastId);
  if (!last) return;
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
    const next = upcomingTime(new Date(last.end ?? Date.now()), String(new FormData(form).get('next'))).getTime();
    // A fast already set to start later just moves; otherwise the ended fast remembers the new start.
    await db.putFast(last.end === undefined ? { ...last, start: next } : { ...last, nextStart: next });
    s.close();
    toast(`Next fast starts at ${formatTime(new Date(next))}`);
  });
}
