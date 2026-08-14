# Recommend Position Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Position` text input to the popup's *Recommend greet* row, persist the value to `chrome.storage.local`, and gate the Enable button on a non-empty value. No Gemini integration in this plan.

**Architecture:** Add `recommendPosition: string` to `AppConfig` (single source of truth). Popup polls `GET_STATE`, reads `SwToPopup.recommendPosition`, debounces input changes via `UPDATE_CONFIG`. SW guards `TOGGLE_RECOMMEND` to refuse enabling when position is empty.

**Tech Stack:** React 18, TypeScript (strict), Tailwind v4, Chrome MV3 (SW + chrome.storage.local). No test runner — verification is `tsc -b` + manual smoke tests.

---

## File Structure

This plan touches 4 files. No new files are created.

| File | Responsibility | Change |
|---|---|---|
| `src/shared/types.ts` | Type definitions | Add `recommendPosition` to `AppConfig` + `DEFAULT_CONFIG` |
| `src/shared/messages.ts` | SW ↔ popup + SW ↔ content message unions | Add `recommendPosition` to `SwToPopup` |
| `src/background/index.ts` | SW message handler + state builder | Implement `UPDATE_CONFIG`, add field to `buildState`, guard `TOGGLE_RECOMMEND` |
| `src/popup/App.tsx` | React popup UI | Add `position` state + debounce + sync, add `<input>` to `RecommendRow`, gate Enable button |

---

## Task 1: Add `recommendPosition` to shared types

**Files:**
- Modify: `src/shared/types.ts:3-9` (AppConfig) and `src/shared/types.ts:45-51` (DEFAULT_CONFIG)

- [ ] **Step 1: Add `recommendPosition` to `AppConfig`**

Open `src/shared/types.ts`. Locate the `AppConfig` type (lines 3–9). Add `recommendPosition` after `systemPrompt`:

```ts
type AppConfig = {
  model: 'gemini-3.5-flash' | 'gemini-2.5-flash'
  throttleMinMs: number // default2000
  throttleMaxMs: number // default5000
  dailyLimit: number // default200
  systemPrompt: string // hardcode, không expose UI
  recommendPosition: string // user-entered target position for recommend-greet loop; "" if unset
}
```

- [ ] **Step 2: Add `recommendPosition` to `DEFAULT_CONFIG`**

Locate `DEFAULT_CONFIG` (lines 45–51). Add `recommendPosition: ''`:

```ts
const DEFAULT_CONFIG: AppConfig = {
  model: 'gemini-2.5-flash',
  throttleMinMs: 2000,
  throttleMaxMs: 5000,
  dailyLimit: 50,
  systemPrompt: '',
  recommendPosition: '',
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run build`
Expected: success — `tsc -b && vite build` exits 0 with no type errors. The defensive merge in `storage.getAll()` (`{ ...cloneDefault(), ...stored, config: { ...cloneDefault().config, ...stored.config } }`) will fill in `recommendPosition: ''` for any pre-existing persisted state.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add recommendPosition to AppConfig"
```

---

## Task 2: Add `recommendPosition` to `SwToPopup`

**Files:**
- Modify: `src/shared/messages.ts:74-97` (SwToPopup type)

- [ ] **Step 1: Add `recommendPosition` field**

Open `src/shared/messages.ts`. Locate the `SwToPopup` type. Add `recommendPosition: string` at the end (after `recommendGreeted`):

```ts
type SwToPopup = {
  type: 'STATE'
  enabled: boolean
  sent: number
  dailyLimit: number
  errors: number
  lastErrorMsg: string
  lastSuccessMsg: string
  isRunning: boolean
  reachedDailyLimit: boolean
  recommendReachedDailyLimit: boolean
  recommendEnabled: boolean
  recommendGreeted: number
  // Current value of the user-entered position for recommend-greet.
  // Sourced from Persisted.config.recommendPosition. Empty string when unset.
  recommendPosition: string
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: SUCCESS — but `tsc -b` will FAIL because `src/background/index.ts:buildState` does not yet produce `recommendPosition`. The expected error is:

```
src/background/index.ts(97,5): error TS2741: Property 'recommendPosition' is missing in type ...
```

This is expected. It will be fixed in Task 3.

- [ ] **Step 3: Commit anyway (build will be fixed in next task)**

```bash
git add src/shared/messages.ts
git commit -m "feat(messages): add recommendPosition to SwToPopup"
```

Note: the working tree will fail `npm run build` until Task 3 lands. This is intentional — the messages/types are layered so each task can be reviewed independently.

---

## Task 3: Wire up SW (`UPDATE_CONFIG`, `buildState`, `TOGGLE_RECOMMEND` guard)

**Files:**
- Modify: `src/background/index.ts` (handlePopupMessage UPDATE_CONFIG case, buildState, TOGGLE_RECOMMEND case)

- [ ] **Step 1: Implement the `UPDATE_CONFIG` case**

In `handlePopupMessage` (around line 62), replace the no-op `UPDATE_CONFIG` case with a real implementation that calls `storage.updateConfig`:

```ts
    case 'UPDATE_CONFIG':
      await storage.updateConfig(msg.config)
      return stateNow()
```

(Remove the comment about "API key is hardcoded... Kept in the union for backward compat" — it is no longer accurate.)

- [ ] **Step 2: Add `recommendPosition` to `buildState`**

Locate `buildState` (lines 97–112). Add the new field:

```ts
function buildState(cur: Awaited<ReturnType<typeof storage.getAll>>): SwToPopup {
  return {
    type: 'STATE',
    enabled: cur.enabled,
    sent: cur.stats.sent,
    dailyLimit: cur.config.dailyLimit,
    errors: cur.stats.errors,
    lastErrorMsg: cur.stats.lastErrorMsg,
    lastSuccessMsg: cur.stats.lastSuccessMsg,
    isRunning: cur.isRunning,
    reachedDailyLimit: cur.stats.sent >= cur.config.dailyLimit,
    recommendReachedDailyLimit: cur.recommendGreeted >= cur.config.dailyLimit,
    recommendEnabled: cur.recommendEnabled,
    recommendGreeted: cur.recommendGreeted,
    recommendPosition: cur.config.recommendPosition,
  }
}
```

- [ ] **Step 3: Add `TOGGLE_RECOMMEND` empty-position guard**

Locate the `TOGGLE_RECOMMEND` case (around line 66). Replace it with:

```ts
    case 'TOGGLE_RECOMMEND': {
      // Read the latest config (popup just sent UPDATE_CONFIG, but the
      // round-trip may not have landed yet — race-guard via storage).
      const cur = await storage.getAll()
      if (msg.enabled && cur.config.recommendPosition.trim() === '') {
        await storage.recordError('Position required for recommend-greet')
        return stateNow()
      }
      await storage.setRecommendEnabled(msg.enabled)
      if (msg.enabled) {
        // Click 推荐牛人 tab ONCE on enable. Per-card ticks of the loop
        // assume the iframe is already mounted (see runRecommendGreetOnce).
        if (!(await loop.ensureRecommendTab())) {
          await storage.setRecommendEnabled(false)
          await storage.recordError('Please try to load the boss zhipin page again before enabling recommend-greet.')
          return stateNow()
        }
        await sleep(5000)
        // Fire the recommend-greet loop immediately on click.
        loop.runRecommendGreetOnce().catch((e) => storage.recordError(String(e)))
      }
      return stateNow()
    }
```

Note: `setRecommendEnabled` already enforces mutual exclusion (turns off `enabled`). No change needed there.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: SUCCESS — `tsc -b && vite build` exits 0.

- [ ] **Step 5: Manual smoke test (SW only)**

If you can run the SW in isolation (e.g. via the Chrome extensions dev page), exercise the path:

1. Open chrome://extensions, enable Developer mode, click "Service worker" under the extension card to open the SW devtools console.
2. From the SW console, run:
   ```js
   await chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG', config: { recommendPosition: 'Java' } })
   ```
   Expected: returns a `STATE` object with `recommendPosition: "Java"`.
3. Run:
   ```js
   await chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG', config: { recommendPosition: '' } })
   await chrome.runtime.sendMessage({ type: 'TOGGLE_RECOMMEND', enabled: true })
   ```
   Expected: the second message returns a `STATE` with `recommendEnabled: false` and `lastErrorMsg: "Position required for recommend-greet"`.

If you can't run the SW in isolation, skip this step — the build success + Task 4 manual test will exercise the path.

- [ ] **Step 6: Commit**

```bash
git add src/background/index.ts
git commit -m "feat(sw): implement UPDATE_CONFIG and guard TOGGLE_RECOMMEND on position"
```

---

## Task 4: Add position state + debounce + input UI in `App.tsx`

**Files:**
- Modify: `src/popup/App.tsx` (DEFAULT_STATE, App state hooks, useEffect sync, handleSeenGreet flush, RecommendRow props + JSX)

This task has 5 logical changes, all in one file. They go in a single commit because:
- They share local state (position, positionDebounceRef, positionSyncedRef)
- TypeScript will reject any partial state (RecommendRow prop additions break callers)
- The reviewer wants to see the complete feature, not half-wired hooks

- [ ] **Step 1: Add `recommendPosition: ''` to `DEFAULT_STATE`**

Open `src/popup/App.tsx`. Locate `DEFAULT_STATE` (lines 17–30). Add the field:

```ts
const DEFAULT_STATE: SwToPopup = {
  type: "STATE",
  enabled: false,
  sent: 0,
  dailyLimit: 50,
  errors: 0,
  lastErrorMsg: "",
  lastSuccessMsg: "",
  isRunning: false,
  reachedDailyLimit: false,
  recommendReachedDailyLimit: false,
  recommendEnabled: false,
  recommendGreeted: 0,
  recommendPosition: "",
};
```

- [ ] **Step 2: Add `position` state + debounce refs in `App`**

In the `App` function (after the existing `recommendToggling` state on line 36), add:

```tsx
  // Position is stored in Persisted.config; local state mirrors it.
  // Debounced so we don't send UPDATE_CONFIG on every keystroke.
  const [position, setPosition] = useState(DEFAULT_STATE.recommendPosition);
  const positionDebounceRef = useRef<number | null>(null);
  // Tracks whether the first GET_STATE poll has been used to hydrate
  // `position`. Prevents the SW echo from clobbering user input.
  const positionSyncedRef = useRef(false);
```

- [ ] **Step 3: Hydrate `position` on first poll**

Inside the existing `useEffect` (the GET_STATE polling effect, lines 43–79), add a one-shot sync **before** `setState(next)`:

```tsx
          if (!cancelled && r && r.type === "STATE") {
            const next = r;
            // First poll: hydrate position from SW. Subsequent polls leave
            // local state alone so the user can keep typing.
            if (!positionSyncedRef.current) {
              setPosition(next.recommendPosition);
              positionSyncedRef.current = true;
            }
            // New success message from the loop (e.g. daily goal reached).
```

(Insert these 4 lines right after `const next = r;`. The rest of the effect is unchanged.)

- [ ] **Step 4: Add `handlePositionChange` + flush in `App`**

After the existing `handleReset` function (around line 141), add the position handlers and a debounce-cleanup effect:

```tsx
  const handlePositionChange = (next: string) => {
    setPosition(next);
    if (positionDebounceRef.current !== null) {
      clearTimeout(positionDebounceRef.current);
    }
    positionDebounceRef.current = window.setTimeout(() => {
      chrome.runtime
        .sendMessage({
          type: "UPDATE_CONFIG",
          config: { recommendPosition: next.trim() },
        } satisfies PopupToSw)
        .catch((e) => console.warn("[popup] UPDATE_CONFIG failed", e));
      positionDebounceRef.current = null;
    }, 400);
  };

  // Flush any pending position debounce before toggling recommend. The SW
  // guard reads storage, so if the debounce hasn't fired yet, the check
  // would race against an empty position.
  const flushPositionDebounce = async (): Promise<void> => {
    if (positionDebounceRef.current === null) return;
    clearTimeout(positionDebounceRef.current);
    positionDebounceRef.current = null;
    try {
      await chrome.runtime.sendMessage({
        type: "UPDATE_CONFIG",
        config: { recommendPosition: position.trim() },
      } satisfies PopupToSw);
    } catch (e) {
      console.warn("[popup] UPDATE_CONFIG flush failed", e);
    }
  };

  // Clear any pending debounce timer when the popup unmounts.
  useEffect(() => {
    return () => {
      if (positionDebounceRef.current !== null) {
        clearTimeout(positionDebounceRef.current);
        positionDebounceRef.current = null;
      }
    };
  }, []);
```

- [ ] **Step 5: Update `handleSeenGreet` to flush before toggling**

Replace the existing `handleSeenGreet` (lines 111–139) with a version that awaits the flush before sending `TOGGLE_RECOMMEND`:

```tsx
  const handleSeenGreet = async () => {
    if (recommendToggling) return;
    // Flush so the SW guard sees the latest position (storage is the
    // source of truth for the empty-check).
    await flushPositionDebounce();
    if (state.recommendReachedDailyLimit && !state.recommendEnabled) {
      showToast(
        `Reached daily limit ${state.dailyLimit} greets/day. Please try again tomorrow.`,
        "warning"
      );
      return;
    }
    const next = !state.recommendEnabled;
    setRecommendToggling(true);
    try {
      const r = await chrome.runtime.sendMessage({
        type: "TOGGLE_RECOMMEND",
        enabled: next,
      } satisfies PopupToSw);
      if (r && r.type === "STATE") {
        setState(r);
        showToast(
          next ? "Recommend greet is enabled" : "Recommend greet is disabled",
          "info"
        );
      }
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    } finally {
      setRecommendToggling(false);
    }
  };
```

The `flushPositionDebounce` is a no-op when nothing is pending, so the overhead is one ref check on every click.

- [ ] **Step 6: Pass position + handler to `RecommendRow`**

Locate the `RecommendRow` JSX (around line 177–185). Add the new props:

```tsx
      <RecommendRow
        recommendEnabled={state.recommendEnabled}
        recommendGreeted={state.recommendGreeted}
        dailyLimit={state.dailyLimit}
        reachedDailyLimit={state.recommendReachedDailyLimit}
        onClick={handleSeenGreet}
        otherActive={state.enabled}
        toggling={recommendToggling}
        position={position}
        onPositionChange={handlePositionChange}
      />
```

- [ ] **Step 7: Update `RecommendRow` signature and JSX**

Locate the `RecommendRow` function definition (around line 294). Replace the props block and return JSX:

```tsx
function RecommendRow({
  recommendEnabled,
  recommendGreeted,
  dailyLimit,
  reachedDailyLimit,
  onClick,
  otherActive,
  toggling,
  position,
  onPositionChange,
}: {
  recommendEnabled: boolean;
  recommendGreeted: number;
  dailyLimit: number;
  reachedDailyLimit: boolean;
  onClick: () => void;
  otherActive: boolean;
  toggling: boolean;
  position: string;
  onPositionChange: (next: string) => void;
}) {
  const limitReached = recommendGreeted >= dailyLimit || reachedDailyLimit;
  const positionEmpty = position.trim() === "";
  const label = (limitReached || otherActive || recommendEnabled)
    ? "Disable"
    : "Enable";
  return (
    <div
      className={`flex flex-col p-3 rounded-md mb-2 ${
        limitReached
          ? "bg-amber-900"
          : recommendEnabled
          ? "bg-sky-900"
          : "bg-slate-800"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold">Recommend greet</div>
          <div
            className={`text-[11px] ${
              otherActive ? "text-slate-400 italic" : ""
            }`}
          >
            {otherActive ? "Auto reply is currently running" : ""}
          </div>
          <div
            className={`text-[11px] ${
              limitReached
                ? "text-amber-300"
                : recommendEnabled
                ? "text-sky-300"
                : "text-slate-400"
            }`}
          >
            {recommendGreeted} / {dailyLimit} today
          </div>
        </div>
        <ButtonComponent
          onClick={onClick}
          text={label}
          classNameProps={
            limitReached
              ? "!bg-amber-700 !cursor-not-allowed hover:!bg-amber-700"
              : recommendEnabled
              ? "!bg-rose-600 hover:!bg-rose-500"
              : "!bg-sky-600 hover:!bg-sky-500"
          }
          disabled={toggling || limitReached || otherActive || positionEmpty}
        />
      </div>
      <input
        type="text"
        value={position}
        onChange={(e) => onPositionChange(e.target.value)}
        placeholder="Position (e.g. Java)"
        className="mt-2 bg-slate-700 text-white text-[11px] p-1.5 rounded w-full placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
    </div>
  );
}
```

Note: the outer `<div>` changed from `flex items-center justify-between` to `flex flex-col` to stack the input row below the existing label/button row. The original row is preserved with its own `flex items-center justify-between` inside.

- [ ] **Step 8: Verify build**

Run: `npm run build`
Expected: SUCCESS.

- [ ] **Step 9: Manual smoke test**

1. `npm run dev` (or load `dist/` unpacked in Chrome).
2. Open the popup. Confirm a text input appears in the *Recommend greet* row.
3. Type `Java` → wait ~500ms → open SW devtools console → check `chrome.storage.local.get('auto-reply:persisted')` → confirm `config.recommendPosition === "Java"`.
4. Clear the input → wait → click Enable → confirm the button does nothing (still disabled).
5. Type `Java` → click Enable quickly (within 400ms of typing) → confirm SW logs show `recommendEnabled: true` AND the storage check passed (no `"Position required for recommend-greet"` error toast).
6. Close and reopen the popup → confirm the input shows `Java` again.
7. Type only spaces (e.g. `   `) → wait → confirm Enable button is disabled (whitespace-only is treated as empty).

- [ ] **Step 10: Commit**

```bash
git add src/popup/App.tsx
git commit -m "feat(popup): position input for recommend-greet, gates Enable button"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| Add `recommendPosition` to `AppConfig` + `DEFAULT_CONFIG` | Task 1 |
| Add `recommendPosition` to `SwToPopup` | Task 2 |
| Implement `UPDATE_CONFIG` in SW | Task 3 |
| Add `recommendPosition` to `buildState` | Task 3 |
| `TOGGLE_RECOMMEND` empty-position guard | Task 3 |
| `position` state in App | Task 4 step 2 |
| First-poll sync from GET_STATE | Task 4 step 3 |
| Debounced `UPDATE_CONFIG` (400 ms) | Task 4 step 4 |
| `onBlur` flush | Removed — superseded by `flushPositionDebounce` before `TOGGLE_RECOMMEND`. Same goal (no race), less code, fewer coupling points. |
| Disable Enable button when empty | Task 4 step 7 |
| `DEFAULT_STATE.recommendPosition: ''` | Task 4 step 1 |
| Pass `position` + `onPositionChange` to `RecommendRow` | Task 4 step 6 |
| Add `<input>` UI to `RecommendRow` | Task 4 step 7 |
| Error: SW down on UPDATE_CONFIG | Task 4 step 4 (catch + console.warn, no toast) |
| Error: TOGGLE_RECOMMEND with empty position | Task 3 step 3 + Task 4 step 5 (popup flushes, SW guards as backup) |
| Error: whitespace-only input | Task 4 step 7 (`position.trim() === ""`) + Task 3 step 3 (`.trim()` on SW guard) |
| Backward compat (defensive merge) | Task 1 step 3 (calls out existing behavior) |
| Manual test plan | Task 4 step 9 |
| File changes summary | Task 1, 2, 3, 4 headers |
| Out of scope (Gemini, multiple positions, filter) | Out of scope (verified by absence — no Gemini call added) |

One deviation: spec mentioned an `onBlur` flush on the input. Plan replaces it with a flush before `TOGGLE_RECOMMEND` instead. Rationale: the spec's onBlur flush only matters if the user might close the popup mid-debounce without clicking Enable. The TOGGLE_RECOMMEND flush covers the actual race (user types → clicks Enable before debounce). If the popup is just closed, the debounce is canceled by the unmount cleanup (Task 4 step 4).

**2. Placeholder scan:** No "TBD", "TODO", "implement later", "add validation", "similar to Task N" present.

**3. Type consistency:**
- `recommendPosition: string` appears identically in `AppConfig`, `SwToPopup`, `DEFAULT_CONFIG`, `DEFAULT_STATE`.
- `position` (popup local state) is `string`, mirrors `recommendPosition`.
- `handlePositionChange(next: string)` parameter type consistent across `App.tsx` and `RecommendRow` props.
- `flushPositionDebounce(): Promise<void>` is async and matches `handleSeenGreet`'s `await` usage.

**4. Gaps:** None.