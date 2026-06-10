// === src/popup/scripts.ts ===
// Popup-side helpers. Only the helpers actually used by the popup live here.

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const loadTab = async (tab: chrome.tabs.Tab) => {
  return new Promise((resolve) => {
    const listener = (tabId: number, changeInfo: { status?: string }) => {
      if (tabId === tab.id && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener)
        resolve(undefined)
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
}

// Show a transient toast inside the popup. The target element is the
// <div id="notification"> rendered by App. Auto-hides after 3s.
export const showToast = (message: string, type: "success" | "error" | "warning" | "info" = "success") => {
  const toast: HTMLElement | null = document.getElementById("notification")
  if (!toast) return

  const allTypes = [
    "bg-emerald-500/90", "text-white",
    "bg-rose-500/90",
    "bg-amber-500/90", "text-black",
    "bg-blue-500/90",
  ]
  toast.classList.remove(...allTypes)

  const typeStyle: Record<string, string> = {
    success: "bg-emerald-500/90 text-white",
    error: "bg-rose-500/90 text-white",
    warning: "bg-amber-500/90 text-black",
    info: "bg-blue-500/90 text-white",
  }
  toast.classList.add(...typeStyle[type].split(" "))

  toast.style.transition = "all 0.45s cubic-bezier(0.22,1,0.36,1)"
  toast.textContent = message

  requestAnimationFrame(() => {
    toast.classList.remove("translate-x-full", "opacity-0", "scale-95")
    toast.classList.add("translate-x-0", "opacity-100", "scale-100")
  })

  setTimeout(() => {
    toast.classList.remove("translate-x-0", "opacity-100", "scale-100")
    toast.classList.add("translate-x-full", "opacity-0", "scale-95")
  }, 3000)
}
