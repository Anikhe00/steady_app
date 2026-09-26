import * as db from './db';
import { fastingStatus } from './dates';
import { EATING_HOURS, type Settings } from './types';

// Browsers can only schedule a notification while the page is alive (open or
// recently backgrounded); a fully closed PWA needs a push server, which v1
// doesn't have. So: a timer while the app runs, re-armed whenever it becomes
// visible, and the Today screen shows an in-app banner as the fallback.

const LEAD_MS = 60 * 60 * 1000;
let timer: number | undefined;

export const notificationsSupported = () => 'Notification' in window && 'serviceWorker' in navigator;

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export async function requestPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

async function notify(windowDay: string, minutesLeft: number) {
  const key = `reminded:${windowDay}`;
  if (await db.getFlag(key)) return;
  await db.setFlag(key, true);
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('Steady', {
    body: `Your eating window closes in ${minutesLeft} minutes. Time for your last meal if you need one.`,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: `window-${windowDay}`,
  });
}

export function scheduleReminder(settings: Settings | null): void {
  clearTimeout(timer);
  if (!settings?.remindersOn || !notificationsSupported() || Notification.permission !== 'granted') return;

  const startFor = (day: string) => db.data.days[day]?.shiftedStart ?? settings.windowStart;
  const eatingHours = EATING_HOURS[settings.plan];
  const now = new Date();
  const s = fastingStatus(now, eatingHours, startFor);

  let fireAt: number;
  if (s.phase === 'eating') {
    fireAt = s.end.getTime() - LEAD_MS;
    if (fireAt <= now.getTime()) {
      notify(s.windowDay, Math.max(1, Math.round(s.remainingMs / 60_000))).catch(() => {});
      return;
    }
  } else {
    fireAt = s.end.getTime() + eatingHours * 3_600_000 - LEAD_MS;
  }
  timer = window.setTimeout(() => scheduleReminder(db.data.settings), Math.min(fireAt - now.getTime(), 2 ** 31 - 1));
}
