# Steady

A personal weight-loss tracker PWA built around recovering from slips, not perfect streaks.

- Vite + vanilla TypeScript, no framework
- Installable, works fully offline (vite-plugin-pwa service worker)
- All data stays on the phone in IndexedDB (idb-keyval)

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (date logic, streaks, rolling average, backups)
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ (service worker active) on http://localhost:4173
```

## Structure

```
src/main.ts          boot, tab routing, re-render on data change
src/lib/types.ts     data model
src/lib/db.ts        IndexedDB storage (one key per collection)
src/lib/dates.ts     fasting status, never-miss-twice streak, rolling average
src/lib/stats.ts     week tiles, streak, triggers, unit conversion
src/lib/backup.ts    export/restore validation
src/lib/reminders.ts window-closing notification
src/screens/         today, food, progress, setup
src/ui/              sheets, ring, weight chart, form sheets
src/styles/          tokens (light/dark) and app styles
```

## Rules the app follows

- A day counts if you kept your fasting window or did at least one habit.
  A slip never turns a day into a miss, and today is never a miss until it ends.
- Streak: one missed day is forgiven, two in a row ends it.
- In Setup you set when your fast starts. The fast end, eating window and next
  fast start are worked out from the plan (14:10, 16:8, 18:6 or 20:4).
- While fasting, the Today ring shows time fasted, time remaining, start and
  end, and tappable markers for body stages (src/lib/stages.ts). Stage
  timings are rough averages, and the app says so.
- Weight is stored in kg and shown in your chosen unit. The trend line is the
  7-day rolling average; raw weigh-ins are the faint dots.
- Every meal needs a photo. Photos are shrunk to 1280px JPEG, stored on the
  phone in IndexedDB, and included in the JSON backup.
- Reminders fire 1 hour before the eating window closes, while the app is open
  or in the background. With no push server, a fully closed app can't notify,
  so the Today screen also shows a banner in the last hour.

## Deploy to Vercel

```sh
npm i -g vercel
vercel login
vercel --prod
```

Or import the GitHub repo at vercel.com/new; the defaults (build `npm run build`,
output `dist`) are already set in `vercel.json`.

## Install on your phone

- **iPhone (Safari):** open the Vercel URL, tap Share, then **Add to Home Screen**.
  Open Steady from the home screen icon (not Safari) so notifications can be enabled.
- **Android (Chrome):** open the URL, tap the menu, then **Install app**.

Your data lives only on that phone. Use Setup → Export backup now and then.
