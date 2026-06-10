// === src/popup/App.tsx ===
// Layout B: title + toggle row + 2x2 status grid + error line.
// Polls the service worker once per second while the popup is open.
import './index.css'
import { useEffect, useState } from "react"
import ButtonComponent from "@/components/ButtonComponent"
import { showToast } from "./scripts"
import type { PopupToSw, SwToPopup } from "@/shared/messages"

const DEFAULT_STATE: SwToPopup = {
  type: "STATE",
  enabled: false,
  sent: 0,
  dailyLimit: 200,
  errors: 0,
  lastErrorMsg: "",
  inActiveWindow: false,
  isRunning: false,
}

export default function App() {
  const [state, setState] = useState<SwToPopup>(DEFAULT_STATE)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchState = async () => {
      try {
        const r = await chrome.runtime.sendMessage({
          type: "GET_STATE",
        } satisfies PopupToSw)
        if (!cancelled && r && r.type === "STATE") setState(r)
      } catch {
        // SW may not be ready yet (cold start) — ignore and retry on next tick.
      }
    }
    fetchState()
    const id = setInterval(fetchState, 1000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const onToggle = async () => {
    if (toggling) return
    setToggling(true)
    const next = !state.enabled
    try {
      const r = await chrome.runtime.sendMessage({
        type: "TOGGLE_ENABLED",
        enabled: next,
      } satisfies PopupToSw)
      if (r && r.type === "STATE") setState(r)
      showToast(next ? "Đã bật auto-reply" : "Đã tắt auto-reply", "info")
    } catch (e) {
      showToast(`Lỗi: ${(e as Error).message}`, "error")
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="relative w-[280px] bg-slate-900 text-white p-3 font-sans">
      <div
        id="notification"
        className="absolute top-[1rem] right-[1rem] p-1 rounded-md shadow-lg"
      ></div>

      <div className="text-center text-2xl font-bold mb-3 text-[#99BBE8]">
        BOSS ZHIPIN
      </div>

      <ToggleRow enabled={state.enabled} onClick={onToggle} disabled={toggling} />
      <StatusGrid state={state} />
      <ErrorLine msg={state.lastErrorMsg} />
    </div>
  )
}

function ToggleRow({
  enabled,
  onClick,
  disabled,
}: {
  enabled: boolean
  onClick: () => void
  disabled: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between p-3 rounded-md mb-2 ${
        enabled ? "bg-emerald-900" : "bg-slate-800"
      }`}
    >
      <div>
        <div className="text-[13px] font-semibold">Auto-reply</div>
        <div
          className={`text-[11px] ${
            enabled ? "text-emerald-300" : "text-slate-400"
          }`}
        >
          {enabled ? "Đang chạy" : "Đã tắt"}
        </div>
      </div>
      <ButtonComponent
        onClick={onClick}
        text={enabled ? "Tắt" : "Bật"}
        classNameProps={
          enabled
            ? "!bg-rose-600 hover:!bg-rose-500"
            : "!bg-emerald-600 hover:!bg-emerald-500"
        }
        disabled={disabled}
      />
    </div>
  )
}

// Emoji are stored as HTML numeric character references so Tailwind v4's
// source scanner (which tokenises every string in .tsx files) never sees
// raw 4-byte UTF-8 codepoints and crashes in String.fromCodePoint.
function StatusGrid({ state }: { state: SwToPopup }) {
  const enabled = state.enabled
  const cells: { icon: string; value: string; active?: boolean }[] = [
    { icon: "&#128236;", value: `${state.sent}/${state.dailyLimit}` },
    { icon: "&#9888;&#65039;", value: `${state.errors} lỗi` },
    {
      icon: "&#9200;",
      value: state.inActiveWindow ? "Trong giờ" : "Ngoài giờ",
      active: state.inActiveWindow,
    },
    {
      icon: "&#128260;",
      value: state.isRunning ? "Đang chạy" : "Đã dừng",
      active: state.isRunning,
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-1 text-[11px] mb-1.5">
      {cells.map((c, i) => {
        const colorClass = !enabled
          ? "text-slate-500"
          : c.active === false
            ? "text-slate-400"
            : c.active === true
              ? "text-emerald-300"
              : "text-white"
        return (
          <div
            key={i}
            className={`bg-slate-800 p-1.5 rounded ${colorClass}`}
          >
            <span dangerouslySetInnerHTML={{ __html: c.icon }} />{" "}
            <b>{c.value}</b>
          </div>
        )
      })}
    </div>
  )
}

function ErrorLine({ msg }: { msg: string }) {
  if (!msg) return <div className="text-[11px] min-h-[14px]">&nbsp;</div>
  return (
    <div className="text-[11px] text-rose-400 min-h-[14px]">
      <span dangerouslySetInnerHTML={{ __html: "&#9888;&#65039;" }} />{" "}
      {msg}
    </div>
  )
}
