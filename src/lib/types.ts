/** '12:12' is no longer offered but kept so older saved settings and backups still work. */
export type FastingPlan = '12:12' | '14:10' | '16:8' | '18:6' | '20:4';
export type WeightUnit = 'kg' | 'lb';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Portion = 'small' | 'medium' | 'large';
export type SlipTrigger =
  | 'stress'
  | 'boredom'
  | 'tired'
  | 'social'
  | 'hungry'
  | 'cravings'
  | 'other';

/** Local calendar date, "YYYY-MM-DD". */
export type DateKey = string;
/** Local clock time, "HH:MM" (24h). */
export type ClockTime = string;

export interface Habit {
  id: string;
  label: string;
}

export interface Settings {
  why: string;
  plan: FastingPlan;
  windowStart: ClockTime;
  habits: Habit[];
  unit: WeightUnit;
  remindersOn: boolean;
  startDate: DateKey;
}

export interface DayLog {
  date: DateKey;
  keptFast: boolean;
  habitsDone: string[];
  /** Eating window start for this day only, when shifted. */
  shiftedStart?: ClockTime;
}

export interface Meal {
  id: string;
  date: DateKey;
  time: ClockTime;
  description: string;
  type: MealType;
  portion: Portion;
  fullness: 1 | 2 | 3 | 4 | 5;
  brokeFast: boolean;
  /** A photo is stored separately under this meal's id. */
  hasPhoto?: boolean;
}

export interface Slip {
  id: string;
  date: DateKey;
  time: ClockTime;
  trigger: SlipTrigger;
  note?: string;
}

export interface WeighIn {
  id: string;
  date: DateKey;
  kg: number;
}

/** One fast, as epoch ms. No `end` means it's still running. */
export interface FastRecord {
  id: string;
  start: number;
  end?: number;
  /** When the next fast starts, if you moved it from end + eating hours. */
  nextStart?: number;
}

export interface AppData {
  settings: Settings | null;
  days: Record<DateKey, DayLog>;
  meals: Meal[];
  slips: Slip[];
  weighIns: WeighIn[];
  fasts: FastRecord[];
}

export interface Backup extends AppData {
  app: 'steady';
  /** 2 added meal photos; version 1 files still restore. */
  version: 1 | 2;
  exportedAt: string;
  /** Meal id -> image as a data: URL. */
  photos?: Record<string, string>;
}

export const EATING_HOURS: Record<FastingPlan, number> = {
  '12:12': 12,
  '14:10': 10,
  '16:8': 8,
  '18:6': 6,
  '20:4': 4,
};

export const TRIGGER_LABELS: Record<SlipTrigger, string> = {
  stress: 'Stress',
  boredom: 'Boredom',
  tired: 'Tired',
  social: 'Social event',
  hungry: 'Very hungry',
  cravings: 'Cravings',
  other: 'Other',
};
