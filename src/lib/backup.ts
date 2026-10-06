import type { AppData, Backup } from './types';

export function makeBackup(data: AppData, photos: Record<string, string> = {}, now = new Date()): Backup {
  return { app: 'steady', version: 2, exportedAt: now.toISOString(), ...structuredClone(data), photos };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

const isDayPlan = (p: unknown) =>
  isObj(p) && (p.kind === 'plan' || p.kind === 'rest' || (p.kind === 'custom' && isTime(p.start) && typeof p.hours === 'number'));
const isWeek = (w: unknown) => Array.isArray(w) && w.length === 7 && w.every(isDayPlan);

export type ReadResult =
  | { ok: true; data: AppData; photos: Record<string, string> }
  | { ok: false; error: string };

/** Checks a parsed backup file. Returns the data (and photo data URLs) to restore, or an error message. */
export function readBackup(parsed: unknown): ReadResult {
  if (!isObj(parsed) || parsed.app !== 'steady') return { ok: false, error: "This isn't a Steady backup file." };
  if (parsed.version !== 1 && parsed.version !== 2) {
    return { ok: false, error: 'This backup is from a newer version of Steady.' };
  }
  const { settings, days, meals, slips, weighIns } = parsed;
  const fasts = parsed.fasts ?? [];
  const photos = parsed.photos ?? {};
  if (settings !== null && !(isObj(settings) && isTime(settings.windowStart) && Array.isArray(settings.habits))) {
    return { ok: false, error: 'The settings in this backup look damaged.' };
  }
  if (settings !== null && settings.week !== undefined && !isWeek(settings.week)) {
    return { ok: false, error: 'The fasting schedule in this backup looks damaged.' };
  }
  if (!isObj(days) || !Array.isArray(meals) || !Array.isArray(slips) || !Array.isArray(weighIns) || !isObj(photos) || !Array.isArray(fasts)) {
    return { ok: false, error: 'This backup is missing some of its data.' };
  }
  const bad =
    meals.some((m) => !isObj(m) || !isDate(m.date) || typeof m.id !== 'string') ||
    slips.some((s) => !isObj(s) || !isDate(s.date) || typeof s.id !== 'string') ||
    weighIns.some((w) => !isObj(w) || !isDate(w.date) || typeof w.kg !== 'number') ||
    fasts.some((f) => !isObj(f) || typeof f.id !== 'string' || typeof f.start !== 'number') ||
    Object.values(photos).some((p) => typeof p !== 'string' || !p.startsWith('data:image/'));
  if (bad) return { ok: false, error: 'Some entries in this backup look damaged.' };

  // A meal only claims a photo if the file actually carries it.
  const cleanMeals = (meals as AppData['meals']).map((m) => {
    if (!m.hasPhoto || photos[m.id]) return m;
    const { hasPhoto: _, ...rest } = m;
    return rest;
  });
  return {
    ok: true,
    data: { settings, days, meals: cleanMeals, slips, weighIns, fasts } as AppData,
    photos: photos as Record<string, string>,
  };
}

export function backupFileName(now = new Date()): string {
  const d = now.toISOString().slice(0, 10);
  return `steady-backup-${d}.json`;
}
