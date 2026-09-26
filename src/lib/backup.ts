import type { AppData, Backup } from './types';

export function makeBackup(data: AppData, now = new Date()): Backup {
  return { app: 'steady', version: 1, exportedAt: now.toISOString(), ...structuredClone(data) };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

/** Checks a parsed backup file. Returns the data to restore or an error message. */
export function readBackup(parsed: unknown): { ok: true; data: AppData } | { ok: false; error: string } {
  if (!isObj(parsed) || parsed.app !== 'steady') return { ok: false, error: "This isn't a Steady backup file." };
  if (parsed.version !== 1) return { ok: false, error: 'This backup is from a newer version of Steady.' };
  const { settings, days, meals, slips, weighIns } = parsed;
  if (settings !== null && !(isObj(settings) && isTime(settings.windowStart) && Array.isArray(settings.habits))) {
    return { ok: false, error: 'The settings in this backup look damaged.' };
  }
  if (!isObj(days) || !Array.isArray(meals) || !Array.isArray(slips) || !Array.isArray(weighIns)) {
    return { ok: false, error: 'This backup is missing some of its data.' };
  }
  const bad =
    meals.some((m) => !isObj(m) || !isDate(m.date) || typeof m.id !== 'string') ||
    slips.some((s) => !isObj(s) || !isDate(s.date) || typeof s.id !== 'string') ||
    weighIns.some((w) => !isObj(w) || !isDate(w.date) || typeof w.kg !== 'number');
  if (bad) return { ok: false, error: 'Some entries in this backup look damaged.' };
  return { ok: true, data: { settings, days, meals, slips, weighIns } as AppData };
}

export function backupFileName(now = new Date()): string {
  const d = now.toISOString().slice(0, 10);
  return `steady-backup-${d}.json`;
}
