import { createStore, del, delMany, get, getMany, keys, set, setMany } from 'idb-keyval';
import type { AppData, DateKey, DayLog, FastRecord, Meal, Settings, Slip, WeighIn } from './types';

// One IndexedDB object store, one key per collection. The whole data set is
// small (a year is well under a megabyte), so it is loaded into memory on boot
// and each change writes back just the collection it touched. Meal photos are
// the exception: each is a Blob under its own "photo:<mealId>" key, read only
// when shown.

const store = createStore('steady', 'data');
const KEYS = ['settings', 'days', 'meals', 'slips', 'weighIns', 'fasts'] as const;
type Key = (typeof KEYS)[number];

export const data: AppData = {
  settings: null,
  days: {},
  meals: [],
  slips: [],
  weighIns: [],
  fasts: [],
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
  const [settings, days, meals, slips, weighIns, fasts] = await getMany(KEYS as unknown as string[], store);
  data.settings = settings ?? null;
  data.days = days ?? {};
  data.meals = meals ?? [];
  data.slips = slips ?? [];
  data.weighIns = weighIns ?? [];
  data.fasts = fasts ?? [];
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

const photoKey = (mealId: string) => `photo:${mealId}`;

export async function addMeal(m: Omit<Meal, 'id' | 'hasPhoto'>, photo?: Blob): Promise<void> {
  const id = uid();
  // Photo first, so a meal never points at a photo that failed to save.
  if (photo) await set(photoKey(id), photo, store);
  data.meals.push({ ...m, id, ...(photo ? { hasPhoto: true } : {}) });
  await save('meals');
}

export async function deleteMeal(id: string): Promise<void> {
  data.meals = data.meals.filter((m) => m.id !== id);
  await save('meals');
  await del(photoKey(id), store);
}

export function getPhoto(mealId: string): Promise<Blob | undefined> {
  return get<Blob>(photoKey(mealId), store);
}

export async function allPhotos(): Promise<Record<string, Blob>> {
  const ids = data.meals.filter((m) => m.hasPhoto).map((m) => m.id);
  const blobs = await getMany<Blob | undefined>(ids.map(photoKey), store);
  const out: Record<string, Blob> = {};
  ids.forEach((id, i) => blobs[i] && (out[id] = blobs[i]!));
  return out;
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

/** Save a fast: updates it if the id exists, otherwise adds it. */
export async function putFast(f: Omit<FastRecord, 'id'> & { id?: string | null }): Promise<string> {
  const id = f.id ?? uid();
  const rec: FastRecord = { ...f, id };
  const i = data.fasts.findIndex((x) => x.id === id);
  if (i >= 0) data.fasts[i] = rec;
  else data.fasts.push(rec);
  await save('fasts');
  return id;
}

/** Replace everything (used by restore). */
export async function replaceAll(next: AppData, photos: Record<string, Blob> = {}): Promise<void> {
  const old = (await keys(store)).filter((k) => String(k).startsWith('photo:'));
  await delMany(old, store);
  await setMany(Object.entries(photos).map(([id, blob]) => [photoKey(id), blob]), store);
  Object.assign(data, next);
  await save(...KEYS);
}

export async function getFlag<T>(key: string): Promise<T | undefined> {
  return get<T>(`flag:${key}`, store);
}
export async function setFlag(key: string, value: unknown): Promise<void> {
  await set(`flag:${key}`, value, store);
}
