// const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

const autoLogin = async () => {
  console.log('auto login start 🚀')
}

// Listen to the message from the popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("📩 received:", msg)
  console.log("📩 sender:", sender)
  console.log("📩 sendResponse:", sendResponse)
  if (
    msg.type === "AUTO_LOGIN" &&
    sender.tab?.id === msg.tabId &&
    window.location.href.includes("oocl.com")
  ) {
    autoLogin()
  }
})