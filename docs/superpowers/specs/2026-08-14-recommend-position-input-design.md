# Recommend Position Input — Design Spec

**Date:** 2026-08-14
**Status:** Approved (brainstorming phase complete)
**Scope:** Popup UI + storage + SW message wiring for a single new field.

## Purpose

Allow the user to enter a target **position** (e.g. "Java", "前端", "Python") in the
popup's *Recommend greet* row. The value is persisted to `chrome.storage.local` and
will be available to future Gemini-driven greet messages. This spec only handles the
input, persistence, and validation — **no Gemini call is added in this change**.

## Design Summary

| Concern | Choice |
|---|---|
| Where the value lives | `Persisted.config.recommendPosition: string` (single source of truth) |
| UI placement | Inline `<input>` inside `RecommendRow`, above the Enable button |
| Required? | Yes — Enable button is `disabled` while input is empty (after trim) |
| Persistence | `chrome.storage.local` via `UPDATE_CONFIG` message (debounced 400 ms) |
| Persistence across sessions | Yes (chrome.storage.local survives browser restart) |
| Gemini integration | **Out of scope.** Position is stored for future use. |

## Architecture

```
┌─────────────┐         GET_STATE (1Hz)         ┌──────────────────┐
│  popup UI   │  ◀───────────────────────── │   background SW   │
│             │   SwToPopup.recommendPosition  │                  │
│ RecommendRow│ ─── UPDATE_CONFIG ──────────▶ │ storage.updateCfg │
│  <input>    │     {recommendPosition: "Java"}│ .recommendPos. │
│ Enable btn │   TOGGLE_RECOMMEND (after) │                  │
└─────────────┘                                └──────────────────┘
```

**Layer separation:**
- `Persisted.config.recommendPosition: string` — single source of truth.
- Popup polls → reads via `SwToPopup.recommendPosition`.
- User types → debounced `UPDATE_CONFIG` → SW → `storage.updateConfig`.
- Enable click → `TOGGLE_RECOMMEND` (no position field; position already persisted).

## Data Flow & Types

### `src/shared/types.ts`

```ts
type AppConfig = {
  model: 'gemini-3.5-flash' | 'gemini-2.5-flash'
  throttleMinMs: number
  throttleMaxMs: number
  dailyLimit: number
  systemPrompt: string
  recommendPosition: string   // NEW. Default "".
}

const DEFAULT_CONFIG: AppConfig = {
  model: 'gemini-2.5-flash',
  throttleMinMs: 2000,
  throttleMaxMs: 5000,
  dailyLimit: 50,
  systemPrompt: '',
  recommendPosition: '',     // NEW.
}
```

The defensive merge in `storage.getAll()` (already present) ensures existing users
with the old `Persisted` schema receive the default empty string.

### `src/shared/messages.ts`

```ts
type SwToPopup = {
  // ... existing fields unchanged ...
  recommendPosition: string   // NEW. Sourced from cur.config.recommendPosition.
}
```

`UPDATE_CONFIG` message type already exists with `config: Partial<AppConfig>`.
No change to message union — only wire it up in the SW.

### `src/background/index.ts`

- Implement the previously-no-op `UPDATE_CONFIG` case to call `storage.updateConfig(msg.config)`.
- `buildState()` adds `recommendPosition: cur.config.recommendPosition`.
- `TOGGLE_RECOMMEND` handler: defensive guard — if `msg.enabled && cur.config.recommendPosition === ''`, record an error, do **not** enable, return current state.

### `src/background/storage.ts`

No changes. `updateConfig` already exists and merges into `Persisted.config`.

## UI / UX (`src/popup/App.tsx`)

### Layout (280 px popup)

```
┌─────────────────────────────────────────┐
│  Recommend greet                         │
│  Auto reply is currently running         │  ← if otherActive
│  0 / 50 today                            │
│  ┌────────────────────────────┐         │
│  │ Position (e.g. Java)       │  input  │
│  └────────────────────────────┘         │
│                            [ Disable ]   │  button
└─────────────────────────────────────────┘
```

### `RecommendRow` props (added)

```ts
position: string
onPositionChange: (next: string) => void
```

Existing props unchanged.

### Input behavior

- `<input type="text">`, placeholder `"Position (e.g. Java)"`.
- `className="bg-slate-700 text-white text-[11px] p-1.5 rounded w-full mt-2"`.
- `onChange` calls `onPositionChange(event.target.value)`.
- Parent (`App`) debounces 400 ms → `UPDATE_CONFIG`.
- `onBlur` immediately flushes any pending debounce.

### `App` state

```ts
const [position, setPosition] = useState(DEFAULT_STATE.recommendPosition)
const positionDebounceRef = useRef<number | null>(null)
const positionSyncedRef = useRef(false)
```

- **First poll only**: when `GET_STATE` returns a non-default response, sync `setPosition(r.recommendPosition)` exactly once (`positionSyncedRef.current = true`).
- **Subsequent polls**: never overwrite local `position` from SW echo. This avoids cursor jumps and clobbering user input while typing.
- The SW echo is still used to refresh `state.recommendPosition` for any other consumers (none in v1, but the field exists on `SwToPopup` for symmetry).

### Debounce mechanism

```ts
const handlePositionChange = (next: string) => {
  setPosition(next)
  if (positionDebounceRef.current !== null) {
    clearTimeout(positionDebounceRef.current)
  }
  positionDebounceRef.current = window.setTimeout(() => {
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      config: { recommendPosition: next.trim() },
    } satisfies PopupToSw).catch((e) => console.warn('[popup] UPDATE_CONFIG failed', e))
    positionDebounceRef.current = null
  }, 400)
}
```

- `onBlur` of the input: if `positionDebounceRef.current !== null`, immediately fire the pending `UPDATE_CONFIG` and `clearTimeout`.

### Enable button gating

Button `disabled` is true when `!position.trim()` is true. The other guard
conditions (`toggling`, `limitReached`, `otherActive`) remain.

### `DEFAULT_STATE`

```ts
recommendPosition: '',
```

## Error Handling

| Scenario | Behavior |
|---|---|
| `UPDATE_CONFIG` fails (SW down) | Swallow error in popup; console.warn. Do not show toast (avoid spam while typing). |
| `TOGGLE_RECOMMEND` arrives with `recommendPosition === ''` (race or bug) | SW records error `"Position required for recommend-greet"`, returns current state, does NOT enable. |
| Whitespace-only input | UI uses `.trim()` before sending. SW also `.trim()` defensively when reading for `TOGGLE_RECOMMEND` guard. |
| Day rollover (recommendGreeted resets) | Position persists (in `AppConfig`, not in `DailyStats`). No special handling. |

## Testing (manual, project has no test runner)

1. Open popup → type `Java` → wait → close.
2. Reopen → input shows `Java`.
3. Try Enable with empty → button stays disabled.
4. Enable with `Java` → background log shows `recommendEnabled=true`.
5. Click 推荐牛人 tab on BOSS → recommend loop starts.

## File Changes Summary

| File | Change |
|---|---|
| `src/shared/types.ts` | Add `recommendPosition: string` to `AppConfig` and `DEFAULT_CONFIG` |
| `src/shared/messages.ts` | Add `recommendPosition: string` to `SwToPopup` |
| `src/background/index.ts` | Implement `UPDATE_CONFIG`; add `recommendPosition` to `buildState`; guard `TOGGLE_RECOMMEND` |
| `src/popup/App.tsx` | Add `<input>` to `RecommendRow`; `position` state + debounce; `DEFAULT_STATE.recommendPosition` |

## Out of Scope

- Gemini call in `runRecommendGreetOnce` that uses `recommendPosition` in a prompt.
- Multiple positions or list input.
- Filtering candidates by position (the user picked "Insert into Gemini prompt", not filter).
- Validation beyond `.trim().length > 0`.