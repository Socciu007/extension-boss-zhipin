import axios from "axios"
export const loadTab = async (tab: chrome.tabs.Tab) => {
  return new Promise((resolve) => {
    const listener = (tabId: number, changeInfo: any) => {
      if (tabId === tab.id && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener)
        resolve(void 0)
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
}

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const showToast = (message: string, type = "success") => {
  const toast: HTMLElement | null = document.getElementById('notification')
  if (!toast) return

  const allTypes = [
    "bg-emerald-500/90", "text-white",
    "bg-rose-500/90",
    "bg-amber-500/90", "text-black",
    "bg-blue-500/90"
  ]
  toast.classList.remove(...allTypes)

  // Color by type
  const typeStyle = {
    success: "bg-emerald-500/90 text-white",
    error: "bg-rose-500/90 text-white",
    warning: "bg-amber-500/90 text-black",
    info: "bg-blue-500/90 text-white",
  }

  toast.classList.add(...typeStyle[type as keyof typeof typeStyle].split(" "))
  // Smooth transition
  toast.style.transition = "all 0.45s cubic-bezier(0.22,1,0.36,1)"

  // Icon + text
  toast.textContent = message

  // Animation in
  requestAnimationFrame(() => {
    toast.classList.remove("translate-x-full", "opacity-0", "scale-95")
    toast.classList.add("translate-x-0", "opacity-100", "scale-100")
  })

  // Auto hide
  setTimeout(() => {
    toast.classList.remove("translate-x-0", "opacity-100", "scale-100")
    toast.classList.add("translate-x-full", "opacity-0", "scale-95")
  }, 3000)
}

export const decodeCapcha = async (base64img: string) => {
  try {
    const formData = new FormData()
    formData.append('user', 'nfwyst')
    formData.append('pass', 'daisikia')
    formData.append('softid', '898124')
    formData.append('codetype', '4004')
    formData.append('file_base64', base64img)
    const response = await axios.post('https://upload.chaojiying.net/Upload/Processing.php', formData)
    return response.data.pic_str
  } catch (error) {
    console.error('Error in getCaptchacode:', error)
    return null
  }
}
