// === src/popup/App.tsx ===
// Layout B: title + toggle row + status grid + error line.
// The loop runs only when the user clicks the button — no time-based scheduling.
// Polls the service worker once per second while the popup is open.
import "./index.css";
import { useEffect, useRef, useState } from "react";
import ButtonComponent from "@/components/ButtonComponent";
import { showToast } from "./scripts";
import type { PopupToSw, SwToPopup } from "@/shared/messages";

// Emoji icons as runtime-evaluated Unicode codepoints. Avoids raw 4-byte
// UTF-8 in source (Tailwind v4 scanner issue) without dangerouslySetInnerHTML.
const ICON_MAIL = String.fromCodePoint(0x1f4ec);
const ICON_WARN = String.fromCodePoint(0x26a0, 0xfe0f);
const ICON_RELOAD = String.fromCodePoint(0x1f504);

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

export default function App() {
  const [state, setState] = useState<SwToPopup>(DEFAULT_STATE);
  const [toggling, setToggling] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [recommendToggling, setRecommendToggling] = useState(false);
  // Position is stored in Persisted.config; local state mirrors it.
  // Debounced so we don't send UPDATE_CONFIG on every keystroke.
  const [position, setPosition] = useState(DEFAULT_STATE.recommendPosition);
  // Tracks an in-flight debounced UPDATE_CONFIG so flushPositionDebounce
  // can send the same value the debounce WOULD have sent, not the React
  // state at click-time (which may not yet reflect the latest keystroke).
  interface PendingPosition {
    timer: number;
    value: string;
  }
  const positionDebounceRef = useRef<PendingPosition | null>(null);
  // Tracks whether the first GET_STATE poll has been used to hydrate
  // `position`. Prevents the SW echo from clobbering user input.
  const positionSyncedRef = useRef(false);
  // Track the last-seen lastSuccessMsg so we fire a success toast on each
  // new achievement (e.g. daily limit reached for chat or recommend).
  // Gated by an in-flight latch so rapid polls don't re-trigger.
  const lastSuccess = useRef("");
  const toastInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const fetchState = async () => {
      try {
        const r = await chrome.runtime.sendMessage({
          type: "GET_STATE",
        } satisfies PopupToSw);
        if (!cancelled && r && r.type === "STATE") {
          const next = r;
          // First poll: hydrate position from SW. Subsequent polls leave
          // local state alone so the user can keep typing.
          if (!positionSyncedRef.current) {
            setPosition(next.recommendPosition);
            positionSyncedRef.current = true;
          }
          // New success message from the loop (e.g. daily goal reached).
          if (
            next.lastSuccessMsg &&
            next.lastSuccessMsg !== lastSuccess.current &&
            !toastInFlight.current
          ) {
            toastInFlight.current = true;
            showToast(next.lastSuccessMsg, "success");
            // Release the in-flight latch after the toast duration so the
            // next achievement can fire.
            setTimeout(() => {
              toastInFlight.current = false;
            }, 3500);
          }
          lastSuccess.current = next.lastSuccessMsg;
          setState(next);
        }
      } catch {
        // SW may not be ready yet (cold start) — ignore and retry on next tick.
      }
    };
    fetchState();
    const id = setInterval(fetchState, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const handleAutoChat = async () => {
    if (toggling) return;
    if (state.reachedDailyLimit && !state.enabled) {
      showToast(
        `Reached daily limit ${state.dailyLimit} replies/day. Please try again tomorrow.`,
        "warning"
      );
      return;
    }
    setToggling(true);
    const next = !state.enabled;
    try {
      const r = await chrome.runtime.sendMessage({
        type: "TOGGLE_ENABLED",
        enabled: next,
      } satisfies PopupToSw);
      if (r && r.type === "STATE") {
        setState(r);
        showToast(
          next ? "Auto reply is enabled" : "Auto reply is disabled",
          "info"
        );
      }
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    } finally {
      setToggling(false);
    }
  };

  const handleSeenGreet = async () => {
    console.log("recommendToggling", recommendToggling);
    if (recommendToggling) return;
    // Flush so the SW guard sees the latest position (storage is the
    // source of truth for the empty-check).
    await flushPositionDebounce();
    // Defensive guard: the Enable button is already disabled when
    // position is empty, but a stray click (or future bug) could still
    // fire this handler. Surface a clear message instead of silently
    // hitting the SW guard.
    console.log("position", position);
    if (position.trim() === "") {
      showToast("Please fill in the job position!", "warning");
      return;
    }
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

  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      const r = await chrome.runtime.sendMessage({
        type: "RESET_STATS",
      } satisfies PopupToSw);
      if (r && r.type === "STATE") {
        setState(r);
        showToast("Today's counters have been reset", "success");
      }
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    } finally {
      setResetting(false);
    }
  };

  const handlePositionChange = (next: string) => {
    // Trim locally so the visible input matches what's persisted. Prevents
    // trailing-whitespace UX where the input shows "Java " while storage
    // holds "Java".
    const trimmed = next.trim();
    setPosition(trimmed);
    if (positionDebounceRef.current !== null) {
      clearTimeout(positionDebounceRef.current.timer);
    }
    const timer = window.setTimeout(() => {
      chrome.runtime
        .sendMessage({
          type: "UPDATE_CONFIG",
          config: { recommendPosition: trimmed },
        } satisfies PopupToSw)
        .catch((e) => console.warn("[popup] UPDATE_CONFIG failed", e));
      positionDebounceRef.current = null;
    }, 400);
    positionDebounceRef.current = { timer, value: trimmed };
  };

  // Flush any pending position debounce before toggling recommend. The SW
  // guard reads storage, so if the debounce hasn't fired yet, the check
  // would race against an empty position.
  const flushPositionDebounce = async (): Promise<void> => {
    const pending = positionDebounceRef.current;
    if (pending === null) return;
    clearTimeout(pending.timer);
    positionDebounceRef.current = null;
    try {
      await chrome.runtime.sendMessage({
        type: "UPDATE_CONFIG",
        config: { recommendPosition: pending.value },
      } satisfies PopupToSw);
    } catch (e) {
      console.warn("[popup] UPDATE_CONFIG flush failed", e);
    }
  };

  // Clear any pending debounce timer when the popup unmounts.
  useEffect(() => {
    return () => {
      if (positionDebounceRef.current !== null) {
        clearTimeout(positionDebounceRef.current.timer);
        positionDebounceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-[280px] bg-slate-900 text-white p-3 font-sans">
      <div
        id="notification"
        className="absolute top-[1rem] right-[1rem] p-1 rounded-md shadow-lg"
      ></div>

      <div className="text-center text-2xl font-bold mb-3 text-[#99BBE8]">
        BOSS ZHIPIN
      </div>

      <ToggleRow
        enabled={state.enabled}
        onClick={handleAutoChat}
        disabled={toggling || state.reachedDailyLimit || state.recommendEnabled}
        limitReached={state.reachedDailyLimit}
        otherActive={state.recommendEnabled}
      />
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
      <StatusGrid state={state} />
      <ErrorLine
        msg={state.lastErrorMsg}
        successMsg={state.lastSuccessMsg}
        limitReached={
          state.reachedDailyLimit || state.recommendReachedDailyLimit
        }
        onReset={handleReset}
        resetting={resetting}
      />
    </div>
  );
}

function ToggleRow({
  enabled,
  onClick,
  disabled,
  limitReached,
  otherActive,
}: {
  enabled: boolean;
  onClick: () => void;
  disabled: boolean;
  limitReached: boolean;
  otherActive: boolean;
}) {
  const buttonLabel = (limitReached || enabled) ? "Disable" : "Enable";
  return (
    <div
      className={`flex items-center justify-between p-3 rounded-md mb-2 ${
        limitReached
          ? "bg-amber-900"
          : enabled
          ? "bg-emerald-900"
          : "bg-slate-800"
      }`}
    >
      <div>
        <div className="text-[13px] font-semibold">Auto-reply</div>
        <div
          className={`text-[11px] ${
            limitReached
              ? "text-amber-300"
              : otherActive
              ? "text-slate-400 italic"
              : ""
          }`}
        >
          {limitReached
            ? "Reached daily limit"
            : otherActive
            ? "Another mode is active"
            : ""}
        </div>
      </div>
      <ButtonComponent
        onClick={onClick}
        text={buttonLabel}
        classNameProps={
          limitReached
            ? "!bg-amber-700 !cursor-not-allowed hover:!bg-amber-700"
            : enabled
            ? "!bg-rose-600 hover:!bg-rose-500"
            : "!bg-emerald-600 hover:!bg-emerald-500"
        }
        disabled={disabled || limitReached || otherActive}
      />
    </div>
  );
}

function StatusGrid({ state }: { state: SwToPopup }) {
  const enabled = state.enabled;
  const cells: { icon: string; value: string; active?: boolean }[] = [
    { icon: ICON_MAIL, value: `${state.sent}/${state.dailyLimit}` },
    { icon: ICON_WARN, value: `${state.errors} errors` },
    {
      icon: ICON_RELOAD,
      value: state.isRunning ? "Running" : "Stopped",
      active: state.isRunning,
    },
    // (Schedule cell removed — loop runs only when user clicks the button.)
  ];
  return (
    <div className="grid grid-cols-2 gap-1 text-[11px] mb-1.5">
      {cells.map((c, i) => {
        const colorClass = !enabled
          ? "text-slate-500"
          : c.active === false
          ? "text-slate-400"
          : c.active === true
          ? "text-emerald-300"
          : "text-white";
        return (
          <div key={i} className={`bg-slate-800 p-1.5 rounded ${colorClass}`}>
            <span>{c.icon}</span>{" "}
            <b>{c.value}</b>
          </div>
        );
      })}
    </div>
  );
}

// Second row: the recommend-greet flow. Independent of the main
// chat-list reply loop. Shows a separate counter and button so the
// user can opt into proactive greets on /web/chat/recommend.
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
          disabled={toggling || limitReached || otherActive}
        />
      </div>
      <input
        type="text"
        value={position}
        onChange={(e) => onPositionChange(e.target.value)}
        placeholder="Position (e.g. Java)"
        aria-label="Position"
        className="mt-2 bg-slate-700 text-white text-[11px] p-1.5 rounded w-full placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
    </div>
  );
}

function ErrorLine({
  msg,
  successMsg,
  limitReached,
  onReset,
  resetting,
}: {
  msg: string;
  successMsg: string;
  limitReached: boolean;
  onReset: () => void;
  resetting: boolean;
}) {
  if (!msg && !successMsg && !limitReached) {
    return <div className="text-[11px] min-h-[14px]">&nbsp;</div>;
  }
  // successMsg (positive achievement) takes priority over msg (real error).
  const text = successMsg || msg;
  const isSuccess = !!successMsg;
  return (
    <div
      className={`text-[11px] min-h-[14px] flex items-center gap-2 flex-wrap ${
        isSuccess ? "text-emerald-400" : "text-rose-400"
      }`}
    >
      {text && (
        <span>
          <span>{ICON_WARN}</span> {text}
        </span>
      )}
      {limitReached && (
        <button
          onClick={onReset}
          disabled={resetting}
          className="px-2 py-0.5 rounded bg-amber-700 hover:bg-amber-600 text-white text-[10px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {resetting ? "Resetting…" : "Reset today"}
        </button>
      )}
    </div>
  );
}
