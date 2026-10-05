import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/figtree';
import './styles/tokens.css';
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';
import * as db from './lib/db';
import { scheduleReminder } from './lib/reminders';
import { renderFood } from './screens/food';
import { renderProgress } from './screens/progress';
import { renderSetup } from './screens/setup';
import { renderToday } from './screens/today';

type Tab = 'today' | 'food' | 'progress' | 'setup';
const TABS: Tab[] = ['today', 'food', 'progress', 'setup'];

const main = document.getElementById('main')!;
const nav = document.getElementById('tabbar')!;
let cleanup: (() => void) | void;

/** "#/today/2026-10-03" opens Today on a past day; the tab is the first part. */
function route(): { tab: Tab; arg?: string } {
  const [t, arg] = location.hash.replace('#/', '').split('/');
  return TABS.includes(t as Tab) ? { tab: t as Tab, arg } : { tab: 'today' };
}
const currentTab = () => route().tab;

function render(): void {
  cleanup?.();
  cleanup = undefined;

  // Remember focus and scroll so a data change doesn't throw the user around.
  const focusId = document.activeElement?.id;
  const scrollY = window.scrollY;

  const onboarding = !db.data.settings;
  const tab = onboarding ? 'setup' : currentTab();
  nav.hidden = onboarding;
  nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  // A fresh element per render so screens never stack event listeners.
  const view = document.createElement('div');
  view.className = `screen screen-${tab}`;
  main.replaceChildren(view);

  switch (tab) {
    case 'today':
      cleanup = renderToday(view, route().arg);
      break;
    case 'food':
      renderFood(view);
      break;
    case 'progress':
      renderProgress(view);
      break;
    case 'setup':
      renderSetup(view, onboarding, () => {
        if (location.hash !== '#/today') location.hash = '#/today';
        else render();
      });
      break;
  }

  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  window.scrollTo(0, scrollY);
}

async function boot(): Promise<void> {
  try {
    await db.load();
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="screen"><section class="banner warn" role="alert">
      <strong>Steady can't open its storage.</strong>
      <span>If you're in a private browsing window, open Steady in a normal window instead.</span>
    </section></div>`;
    return;
  }

  let lastTab = currentTab();
  window.addEventListener('hashchange', () => {
    const tab = currentTab();
    render();
    if (tab !== lastTab) {
      window.scrollTo(0, 0);
      main.focus({ preventScroll: true });
    }
    lastTab = tab;
  });
  window.addEventListener('steady:rerender', render);
  db.onChange(() => {
    render();
    scheduleReminder(db.data.settings);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      render();
      scheduleReminder(db.data.settings);
    }
  });

  render();
  scheduleReminder(db.data.settings);
}

registerSW({ immediate: true });
boot();
