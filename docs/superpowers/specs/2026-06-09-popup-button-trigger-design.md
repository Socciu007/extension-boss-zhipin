# Popup Button-Trigger Refactor — Design

**Date:** 2026-06-09
**Status:** Approved (pending implementation)
**Owner:** BOSS recruiter workflow
**Supersedes scope of:** [2026-06-09-boss-auto-reply-design.md](2026-06-09-boss-auto-reply-design.md) (only the parts explicitly listed in this spec change; everything else still stands)

## Scope of this design

This spec covers the **refactor of the auto-reply trigger model and popup UI** for the
existing BOSS Zhipin auto-reply feature. The change is from **alarm-driven loop** to
**button-triggered self-chaining loop**, plus a cleanup of `./src/popup` and a switch
from BYOK to a hardcoded API key.

Parts of the existing spec that **do NOT change** and are referenced as-is:

- DOM scraping strategy (selectors, content script)
- Storage schema (`src/shared/types.ts`, `src/background/storage.ts`)
- Gemini integration (`src/background/gemini.ts` request shape, fallback behavior)
- Error handling layers, retry policy, race-guard
- Manifest configuration (zhipin match, host_permissions for Gemini)
- Schedule windows, throttle defaults, daily limit (all hardcoded)

## Problem with the alarm-driven design

The previous spec defined `chrome.alarms` as the **primary** trigger. In practice this
meant that once `enabled=true`, the SW would tick every 60 seconds. The first tick
after enabling could be up to a full minute away, and the user had no way to know
when the next reply would fire without opening the popup. This felt distant from a
recruiter's mental model: "I want to start replying now."

Additionally, the spec included a `geminiApiKey` field in `AppConfig` for BYOK, but
the popup UI to set it was a TODO. The key was always empty in practice.

## Goal

Make the popup button the **single source of truth** for "is auto-reply running?".
Click "Bật" → first reply fires within seconds, then continues at human pace
(2-5s jitter). Click "Tắt" → loop halts after the current tick. The popup shows
live status by polling the SW once per second.

## Non-goals (YAGNI)

- options_ui / settings page (API key is hardcoded in code, not user-configurable)
- Per-conversation or per-JD message templates
- "Send 1 reply" debug button (manual mode is out of v1)
- Test-selectors button (debug-only, future work)
- Cold outreach, multi-account
- Any change to the Gemini request shape or model selection
- Any change to DOM selectors, content script, or storage schema

## User flow

1. User installs the extension, opens `chrome://extensions/`, loads the unpacked
   `dist/`.
2. User opens `https://www.zhipin.com/web/chat` in a tab. The content script
   boots and waits for commands from the SW.
3. User clicks the extension icon → popup opens. Layout B is shown:
   - Title "BOSS ZHIPIN"
   - Toggle row: label "Auto-reply" + 1 button "Bật" (or "Tắt" when on)
   - 2×2 status grid: 📨 sent/dailyLimit, ⚠ errors, ⏰ in/out of active window, 🔄 running/stopped
   - Error line (only visible when `lastErrorMsg` is non-empty)
4. User clicks **Bật**. Popup sends `TOGGLE_ENABLED { enabled: true }` to SW.
   Within ~1s the status grid updates: button shows "Tắt", ⏰ / 🔄 cells turn green.
5. ~2-5s later the first reply is sent. Counter increments live.
6. User closes the popup. Loop continues running in SW.
7. User clicks the icon again → popup reopens, shows current state.
8. User clicks **Tắt**. Current tick completes, then the loop halts.

## Architecture

The architecture diagram is unchanged from the existing spec. The only difference
is in the **trigger path** within the service worker:

```
                ┌────────────────────┐
   popup click  │      Popup         │
       │        │  (button + poll)   │
       │        └─────────┬──────────┘
       │                  │ TOGGLE_ENABLED
       ▼                  ▼
┌────────────────────────────────────┐
│ Service Worker                      │
│ ┌──────────────────────────────┐   │
│ │ storage.enabled = true        │   │
│ │ runOnce()        ← immediate  │   │
│ │   …                            │   │
│ │   setTimeout(jitter) ──────────┼─→ runOnce()  ← self-chaining
│ └──────────────────────────────┘   │
│                                     │
│ chrome.alarms (1 min) ← safety net  │
│   only calls runOnce() if it       │
│   hasn't run in a while             │
└────────────────────────────────────┘
```

## File layout

```
src/
  popup/
    main.tsx                # unchanged
    index.html              # +<title>BOSS ZHIPIN</title>
    index.css               # -Vite defaults, keep @import "tailwindcss"
    App.tsx                 # REWRITTEN: 5 small components
    scripts.ts              # -decodeCapcha (hardcoded creds)
    ConfigForm.tsx          # DELETED
    App.css                 # DELETED
  shared/
    prompt.ts               # +export const GEMINI_API_KEY = '…'
  background/
    index.ts                # UPDATE_CONFIG handler becomes no-op
    loop.ts                 # -check !cur.config.geminiApiKey
    gemini.ts               # -BYOK check, use GEMINI_API_KEY from prompt.ts
    storage.ts              # unchanged
    scheduler.ts            # unchanged
  content/features/auto-reply/   # unchanged
manifest.config.ts                # unchanged
```

## Data flow — one tick (unchanged from existing spec)

The internal `runOnce()` data flow is identical to the previous spec. The only
new thing is **how `runOnce()` gets invoked**:

| Trigger | When | Notes |
|---|---|---|
| `TOGGLE_ENABLED { enabled: true }` | User clicks "Bật" | SW calls `runOnce()` immediately. This is the **primary** trigger. |
| `setTimeout(jitter(throttleMin, throttleMax))` | After each successful runOnce | Self-chains the loop while `enabled=true` |
| `chrome.alarms.onAlarm` | Every 60s | **Safety net only**. Catches the case where Chrome killed the SW and the setTimeout chain broke. |

`runOnce()` body (unchanged):

1. `tryAcquireRunLock()` — skip if previous tick still running.
2. `storage.getAll()` — read config + stats.
3. Skip if `!enabled`, `sent >= dailyLimit`, `!isInActiveWindow(config)`, no zhipin tab.
4. `findZhipinTab()` → `chrome.tabs.query`.
5. Send `SCRAPE_UNREAD` → pick first conversation not in `repliedCache`.
6. `OPEN_CONV` → `READ_LAST_MESSAGE` → `gemini.generateReply()` → `SEND_REPLY`.
7. `markReplied(conv)`, `bumpSent()`.
8. `setTimeout(jitter)` → `runOnce()`.
9. `releaseRunLock()` in `finally`.

`runOnce()` checks `cur.enabled` at step 3 — if the user clicked "Tắt" mid-chain,
the next `runOnce()` call will hit the `if (!cur.enabled) return` short-circuit
and the chain breaks. The current `setTimeout` does NOT fire a new `runOnce`
because… *(see the chain break below)*

### Chain break on disable

The chain is broken cleanly by a `boolean` check at the top of `runOnce()`.
There is no cancellation token — we just let the in-flight `setTimeout` fire
`runOnce()` one final time, and the boolean check at the top exits early. The
`finally` block still runs `releaseRunLock()` so the next "Bật" press starts
fresh.

## Cleanup of `./src/popup`

| File / symbol | Action | Reason |
|---|---|---|
| `ConfigForm.tsx` | **Delete** | File is empty (1 line), not referenced from `App.tsx`. |
| `App.css` | **Delete** | Pure Vite default logo styles, never imported after we switched to Tailwind. |
| `decodeCapcha` in `scripts.ts` | **Delete function** | Contains hardcoded credentials `nfwyst/daisikia` posted to `chaojiying.net`. Unrelated to auto-reply. Security risk. |
| `showToast` in `scripts.ts` | Keep | Still used for popup notifications. |
| `loadTab`, `delay` in `scripts.ts` | Keep | Not used in v1 but harmless, may be needed later. |
| `index.html` | Edit | Add `<title>BOSS ZHIPIN</title>`. |
| `index.css` | Edit | Keep `@import "tailwindcss"`. Remove the Vite default body/button/a styles that conflict with Tailwind utility classes. |
| `main.tsx` | Keep | Unchanged. |
| `src/components/ButtonComponent.tsx` | Keep | Reuse for the toggle button. |
| `src/components/InputComponent.tsx`, `SelectComponent.tsx`, `TableComponent.tsx`, `HelloWorld.tsx` | Keep | Not used in v1, not deleted since they already exist. |

## New popup UI

Layout B, simplified (no API key input, no inline config):

```
┌─────────────────────────────────┐
│  BOSS ZHIPIN                    │
├─────────────────────────────────┤
│  Auto-reply        [● Bật ]    │  ← ToggleRow
├─────────────────────────────────┤
│  📨 47/200   ⚠ 2 lỗi           │  ← StatusGrid
│  ⏰ Trong giờ  🔄 Đang chạy    │
├─────────────────────────────────┤
│  ⚠ Gemini 429 — rate limited   │  ← ErrorLine (conditional)
└─────────────────────────────────┘
```

States:
- **OFF** (initial): header dark, button grey "Bật", status cells muted
- **ON**: header dark green, button red "Tắt", status cells active (green if positive)
- **Error**: red error line below the grid (truncated to 200 chars by `recordError`)

### React structure

```tsx
<App>
  <Notification />         // div#notification, target of showToast()
  <Header />              // "BOSS ZHIPIN"
  <ToggleRow
    enabled={state.enabled}
    onClick={toggle}
  />
  <StatusGrid state={state} />   // 2x2 cells
  <ErrorLine msg={state.lastErrorMsg} />
</App>
```

### Polling

- `useEffect` in `App` sets `setInterval(() => sendMessage({ type: 'GET_STATE' }), 1000)`.
- Cleanup on unmount.
- No optimistic updates — always wait for SW response. The 1s interval is
  short enough that the UI feels live.

### State shape

Already defined in `src/shared/messages.ts`:

```ts
type SwToPopup = {
  type: 'STATE'
  enabled: boolean
  sent: number
  dailyLimit: number
  errors: number
  lastErrorMsg: string
  inActiveWindow: boolean
  isRunning: boolean
}
```

## Hardcoded API key

The Gemini API key is no longer in `AppConfig`. It is a module-level const in
`src/shared/prompt.ts`:

```ts
// src/shared/prompt.ts
export const SYSTEM_PROMPT = `…`         // existing
export const FALLBACK_REPLY = `…`        // existing
export const GEMINI_API_KEY = '…'        // NEW — paste actual key here
```

`src/background/gemini.ts` imports `GEMINI_API_KEY` directly. The
`config.geminiApiKey` field is removed from `AppConfig` in
`src/shared/types.ts` (or kept but ignored — see file changes below).

**Security note**: the key is now in the extension bundle and is extractable by
anyone who downloads `dist/`. This is acceptable for an internal tool
(`eptrade.cn` users only) and a v1 simplification. Future v2 may move to
`chrome.storage.local` with a setup flow.

## File changes — detailed

| File | Change |
|---|---|
| `src/popup/ConfigForm.tsx` | **Delete** |
| `src/popup/App.css` | **Delete** |
| `src/popup/index.html` | Add `<title>BOSS ZHIPIN</title>` |
| `src/popup/index.css` | Keep only `@import "tailwindcss"`. Remove the Vite default `:root`, `a`, `body`, `button`, `#app`, `@media` blocks. |
| `src/popup/scripts.ts` | Remove the `decodeCapcha` function (lines 56-70) and the `import axios from 'axios'`. |
| `src/popup/App.tsx` | Full rewrite. New components described above. Imports: `useEffect`, `useState` from React; `showToast` from `./scripts`; `chrome.runtime.sendMessage`. |
| `src/popup/main.tsx` | Unchanged. |
| `src/shared/prompt.ts` | Add `export const GEMINI_API_KEY = 'PASTE_KEY_HERE'` placeholder. |
| `src/shared/types.ts` | **Option A (preferred):** remove `geminiApiKey` from `AppConfig` and from `DEFAULT_CONFIG`. This makes the type honest. **Option B:** keep the field but unused — less clean, but zero risk of breaking the existing `storage.updateConfig` shape. We will go with **Option A** and update the few call sites. |
| `src/background/gemini.ts` | Remove `config.geminiApiKey` checks. Import `GEMINI_API_KEY` from `@/shared/prompt`. Use it directly in the URL. |
| `src/background/loop.ts` | Remove the `if (!cur.config.geminiApiKey) { recordError(...); return }` block. The key is now always available. |
| `src/background/index.ts` | Change `UPDATE_CONFIG` handler: no-op (return current state). The popup no longer sends `UPDATE_CONFIG`. The message type is kept in the union for backward compat. **Keep** `chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 })` in `onInstalled` / `onStartup` — the 1-minute alarm is still wired in as a safety net, it just isn't the primary trigger. |
| `src/background/storage.ts` | `updateConfig` may need a small tweak if the `config.geminiApiKey` field is removed from `AppConfig` — but it's only used by `handlePopupMessage.UPDATE_CONFIG` which becomes a no-op, so the function can stay or be removed. We will leave it. |
| `src/background/scheduler.ts` | Unchanged. |
| `manifest.config.ts` | Unchanged. |
| `src/content/features/auto-reply/**` | Unchanged. |

## Manual test plan (no test framework in repo)

Build and load unpacked as in the existing spec, then:

| # | Test | Expected |
|---|---|---|
| 1 | `npm run build` runs `tsc -b && vite build` | tsc passes; vite build issue (sidepanel) is unrelated |
| 2 | Load unpacked in Chrome | Extension shows in chrome://extensions |
| 3 | Click action icon | Popup shows: title, toggle OFF, all status cells grey, no error line |
| 4 | Open `https://www.zhipin.com/web/chat`, toggle ON | Within ~3-7s, counter goes from 0/200 to 1/200; ⏰/🔄 cells turn green; button shows "Tắt" |
| 5 | Close popup, wait 10s, reopen | Counter still incrementing; toggle still ON |
| 6 | Toggle OFF | Button shows "Bật"; 🔄 cell goes grey; no more replies sent |
| 7 | Toggle OFF mid-tick | Current tick completes (1 reply sent), then loop halts cleanly |
| 8 | Toggle ON with no zhipin tab | Status grid shows running, but no replies sent; error line stays empty (silent skip per spec) |
| 9 | Toggle ON out of active window | Status grid shows ⏰ "Ngoài giờ" in muted color; no replies sent |
| 10 | Send 3 replies rapidly | Jitter 2-5s between them; no two replies under 2s |
| 11 | Force a Gemini error (e.g., invalidate key temporarily) | Error line shows red; errors count increments; counter still 0/200 for that reply |
| 12 | Reload extension | Storage preserved; toggle state preserved |
| 13 | Inspect `dist/manifest.json` | Contains `host_permissions` for `*.zhipin.com` and `generativelanguage.googleapis.com` |
| 14 | Inspect `dist/` for `decodeCapcha` or hardcoded `chaojiying` strings | Should be gone |

## Out-of-scope (future work after v1)

- options_ui / settings page for future config fields
- Per-conversation or per-JD message templates
- "Send 1 reply" debug button
- Test-selectors debug button
- Blacklist/whitelist candidates
- Multi-account support
- Per-error circuit breaker
- Migration of `geminiApiKey` out of code into a secure storage flow

## Open questions for the user

None — all design decisions approved during brainstorming on 2026-06-09.

## References

- Existing spec: [2026-06-09-boss-auto-reply-design.md](2026-06-09-boss-auto-reply-design.md) — full design for the SW, content script, Gemini integration, storage, and manifest. **This spec is the diff on top of that.**
- `src/shared/messages.ts` — source of truth for the `SwToPopup` shape used by the new popup.
- `src/shared/prompt.ts` — source of truth for `SYSTEM_PROMPT`, `FALLBACK_REPLY`, and (new) `GEMINI_API_KEY`.
