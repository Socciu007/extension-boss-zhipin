// === src/popup/App.tsx ===
// Layout B: title + toggle row + status grid + error line.
// The loop runs only when the user clicks the button — no time-based scheduling.
// Polls the service worker once per second while the popup is open.
import "./index.css";
import { useEffect, useRef, useState } from "react";
import ButtonComponent from "@/components/ButtonComponent";
import { showToast } from "./scripts";
import type { PopupToSw, SwToPopup } from "@/shared/messages";

const DEFAULT_STATE: SwToPopup = {
  type: "STATE",
  enabled: false,
  sent: 0,
  dailyLimit: 200,
  errors: 0,
  lastErrorMsg: "",
  isRunning: false,
  reachedDailyLimit: false,
};

export default function App() {
  const [state, setState] = useState<SwToPopup>(DEFAULT_STATE);
  const [toggling, setToggling] = useState(false);
  // Track the last-seen value of reachedDailyLimit so we only fire the
  // "limit reached" toast on the transition (not on every poll).
  const lastReached = useRef(false);
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
          // Detect transition false -> true: daily limit just got hit.
          if (
            next.reachedDailyLimit &&
            !lastReached.current &&
            !toastInFlight.current
          ) {
            toastInFlight.current = true;
            showToast(
              `Reached daily limit ${next.dailyLimit} replies/day. Auto-reply is disabled.`,
              "warning"
            );
            // Release the in-flight latch after the toast duration so the user
            // can re-enable tomorrow without re-triggering on every poll.
            setTimeout(() => {
              toastInFlight.current = false;
            }, 3500);
          }
          lastReached.current = next.reachedDailyLimit;
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

  const onToggle = async () => {
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
      if (r && r.type === "STATE") setState(r);
      showToast(
        next ? "Auto-reply is enabled" : "Auto-reply is disabled",
        "info"
      );
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    } finally {
      setToggling(false);
    }
  };

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
        onClick={onToggle}
        disabled={toggling || state.reachedDailyLimit}
        limitReached={state.reachedDailyLimit}
      />
      <StatusGrid state={state} />
      <ErrorLine msg={state.lastErrorMsg} />
    </div>
  );
}

function ToggleRow({
  enabled,
  onClick,
  disabled,
  limitReached,
}: {
  enabled: boolean;
  onClick: () => void;
  disabled: boolean;
  limitReached: boolean;
}) {
  const buttonLabel = limitReached ? "Disable" : enabled ? "Disable" : "Enable";
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
              && "text-amber-300"
          }`}
        >
          {limitReached && "Reached daily limit"}
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
        disabled={disabled || limitReached}
      />
    </div>
  );
}

// Emoji are stored as HTML numeric character references so Tailwind's source
// scanner never sees raw4-byte UTF-8 codepoints and crashes in
// String.fromCodePoint (a known Tailwind v4 bug, kept here for safety).
function StatusGrid({ state }: { state: SwToPopup }) {
  const enabled = state.enabled;
  const cells: { icon: string; value: string; active?: boolean }[] = [
    { icon: "&#128236;", value: `${state.sent}/${state.dailyLimit}` },
    { icon: "&#9888;&#65039;", value: `${state.errors} errors` },
    {
      icon: "&#128260;",
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
            <span dangerouslySetInnerHTML={{ __html: c.icon }} />{" "}
            <b>{c.value}</b>
          </div>
        );
      })}
    </div>
  );
}

function ErrorLine({ msg }: { msg: string }) {
  if (!msg) return <div className="text-[11px] min-h-[14px]">&nbsp;</div>;
  return (
    <div className="text-[11px] text-rose-400 min-h-[14px]">
      <span dangerouslySetInnerHTML={{ __html: "&#9888;&#65039;" }} /> {msg}
    </div>
  );
}
