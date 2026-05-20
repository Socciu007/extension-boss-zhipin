import axios from "axios"
import { Buffer } from "buffer"
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

// Get cookies from current tab
export const getCookiesEPB = async () => {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    })
    const url1 = "https://www.eptrade.cn/epb/login/scno_direct_bk.html"
    const url = "https://www.eptrade.cn/epb/index.jsp"

    // Load URL
    await chrome.tabs.update(tab.id, { url })
    // Wait for tab to load
    // await loadTab(tab)
    // Check url 
    const currentUrl = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    })
    if (currentUrl[0]?.url?.includes('login')) {
      await chrome.tabs.update(tab.id, { url: url1 })
      await loadTab(tab)
      // Action Login
      const urlImg = await chrome.scripting.executeScript({
        target: { tabId: tab.id as number },
        func: async () => {
          try {
            console.log("Start action login....")
            const tabLogin = document.querySelectorAll(".tabs-title") as NodeListOf<Element>
            if (tabLogin) (tabLogin[1] as HTMLAnchorElement).click()

            const username = document.querySelector("#user_id") as HTMLInputElement
            if (username) username.value = "CN122887"
            const password = document.querySelector("#user_pwd") as HTMLInputElement
            if (password) password.value = "imND3I26"
            const capchaCodeImg = document.querySelector("#safecode") as HTMLButtonElement
            if (capchaCodeImg) {
              const urlImg = capchaCodeImg.getAttribute("src")
              return urlImg
            }
          } catch (error) {
            console.error("Error login in the page", error)
          }
        },
      })
      await delay(1000)

      // Decode capcha code
      const toBase64 = await axios.get(`https://www.eptrade.cn/epb/login/${urlImg[0].result}`, { responseType: "arraybuffer" })
      const capchaCode = await decodeCapcha(
        Buffer.from(toBase64.data, "binary").toString("base64")
      )
      if (!capchaCode) {
        showToast("Please login to the system!", "warning")
        return
      }

      const resultLogin = await chrome.scripting.executeScript({
        target: { tabId: tab.id as number },
        func: async (capchaCode: string) => {
          try {
            const capchaCodeInput = document.querySelector("#login2 > table > tbody > tr:nth-child(3) > td:nth-child(1) > input") as HTMLInputElement
            if (capchaCodeInput) capchaCodeInput.value = capchaCode

            const loginBtn = document.querySelector("#btnLogin") as HTMLButtonElement
            if (loginBtn) loginBtn.click()
            return true
          } catch (error) {
            console.error("Error login in the page", error)
            return false
          }
        },
        args: [capchaCode],
      })
      console.log("resultLogin", resultLogin)
      if (!resultLogin[0].result) {
        showToast("Please start again or login to the system!", "warning")
        return
      }
    }

    // Wait for tab to load
    await loadTab(tab)

    // Get header cookie from website
    const headerCookie = await chrome.cookies.getAll({
      url: "https://www.eptrade.cn/epb",
    })

    // Get yitong order data
    const cookies = headerCookie.map((c: any) => `${c.name}=${c.value}`).join('; ')
    return cookies
  } catch (error) {
    console.error('Error in getCookies:', error)
    return null
  }
}