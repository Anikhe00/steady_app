import { createStore, get, set, setMany, getMany } from 'idb-keyval';
import type { AppData, DateKey, DayLog, Meal, Settings, Slip, WeighIn } from './types';

// One IndexedDB object store, one key per collection. The whole data set is
// small (a year is well under a megabyte), so it is loaded into memory on boot
// and each change writes back just the collection it touched.

const store = createStore('steady', 'data');
const KEYS = ['settings', 'days', 'meals', 'slips', 'weighIns'] as const;
type Key = (typeof KEYS)[number];

export const data: AppData = {
  settings: null,
  days: {},
  meals: [],
  slips: [],
  weighIns: [],
};

type Listener = () => void;
const listeners = new Set<Listener>();
export function onChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function save(...keys: Key[]): Promise<void> {
  await setMany(keys.map((k) => [k, data[k]]), store);
  listeners.forEach((fn) => fn());
}

export async function load(): Promise<void> {
  const [settings, days, meals, slips, weighIns] = await getMany(KEYS as unknown as string[], store);
  data.settings = settings ?? null;
  data.days = days ?? {};
  data.meals = meals ?? [];
  data.slips = slips ?? [];
  data.weighIns = weighIns ?? [];
  // Ask the browser not to evict our data under storage pressure.
  navigator.storage?.persist?.().catch(() => {});
}

export const uid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export async function saveSettings(s: Settings): Promise<void> {
  data.settings = s;
  await save('settings');
}

export function day(date: DateKey): DayLog {
  return data.days[date] ?? { date, keptFast: false, habitsDone: [] };
}

export async function updateDay(date: DateKey, patch: Partial<DayLog>): Promise<void> {
  data.days[date] = { ...day(date), ...patch, date };
  await save('days');
}

export async function addMeal(m: Omit<Meal, 'id'>): Promise<void> {
  data.meals.push({ ...m, id: uid() });
  await save('meals');
}

export async function deleteMeal(id: string): Promise<void> {
  data.meals = data.meals.filter((m) => m.id !== id);
  await save('meals');
}

export async function addSlip(s: Omit<Slip, 'id'>): Promise<void> {
  data.slips.push({ ...s, id: uid() });
  await save('slips');
}

export async function deleteSlip(id: string): Promise<void> {
  data.slips = data.slips.filter((s) => s.id !== id);
  await save('slips');
}

export async function addWeighIn(w: Omit<WeighIn, 'id'>): Promise<void> {
  data.weighIns.push({ ...w, id: uid() });
  await save('weighIns');
}

export async function deleteWeighIn(id: string): Promise<void> {
  data.weighIns = data.weighIns.filter((w) => w.id !== id);
  await save('weighIns');
}

/** Replace everything (used by restore). */
export async function replaceAll(next: AppData): Promise<void> {
  Object.assign(data, next);
  await save(...KEYS);
}

export async function getFlag<T>(key: string): Promise<T | undefined> {
  return get<T>(`flag:${key}`, store);
}
export async function setFlag(key: string, value: unknown): Promise<void> {
  await set(`flag:${key}`, value, store);
}
