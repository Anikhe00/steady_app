export type FastingPlan = '12:12' | '14:10' | '16:8';
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

export interface AppData {
  settings: Settings | null;
  days: Record<DateKey, DayLog>;
  meals: Meal[];
  slips: Slip[];
  weighIns: WeighIn[];
}

export interface Backup extends AppData {
  app: 'steady';
  version: 1;
  exportedAt: string;
}

export const EATING_HOURS: Record<FastingPlan, number> = {
  '12:12': 12,
  '14:10': 10,
  '16:8': 8,
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
