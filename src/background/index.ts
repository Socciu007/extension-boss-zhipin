// === src/background/index.ts ===
// Service worker entry. The loop is triggered only by the popup button —
// no chrome.alarms, no time-based scheduling.

import * as loop from './loop'
import * as storage from './storage'
import type { PopupToSw, SwToPopup } from '@/shared/messages'
import { DEFAULT_PERSISTED } from '@/shared/types'

// Ensure default storage exists on install.
chrome.runtime.onInstalled.addListener(async () => {
  const cur = await storage.getAll()
  if (!cur.config) await storage.patch(DEFAULT_PERSISTED)
})

// On SW startup (after Chrome restart, browser kill, or update) — release
// the run lock. If the SW was killed mid-loop, isRunning would otherwise
// stay true forever and skip future clicks.
chrome.runtime.onStartup.addListener(() => {
  storage.releaseRunLock().catch(() => { })
})

// First SW load of a session — also release the run lock.
storage.releaseRunLock().catch(() => { })

// Message handler from the popup.
chrome.runtime.onMessage.addListener((msg: PopupToSw, _sender, sendResponse) => {
  console.log('msg', msg)
  handlePopupMessage(msg)
    .then((res) => sendResponse(res))
    .catch(async (e) => {
      await storage.recordError(String(e))
      sendResponse(await stateNow())
    })
  return true // async response
})

async function handlePopupMessage(msg: PopupToSw): Promise<SwToPopup> {
  switch (msg.type) {
    case 'GET_STATE': {
      const cur = await storage.getAll()
      return {
        type: 'STATE',
        enabled: cur.enabled,
        sent: cur.stats.sent,
        dailyLimit: cur.config.dailyLimit,
        errors: cur.stats.errors,
        lastErrorMsg: cur.stats.lastErrorMsg,
        isRunning: cur.isRunning,
      }
    }
    case 'TOGGLE_ENABLED':
      await storage.setEnabled(msg.enabled)
      if (msg.enabled) {
        // Fire runOnce immediately on click — no alarm / no kickLoopSoon.
        loop.runOnce().catch((e) => storage.recordError(String(e)))
      }
      return stateNow()
    case 'UPDATE_CONFIG':
      // No-op: API key is hardcoded in @/shared/prompt; config is not
      // user-editable in v1. Kept in the union for backward compat.
      return stateNow()
    case 'CLEAR_REPLIED':
      await storage.clearReplied()
      return stateNow()
    case 'RUN_ONCE':
      // Fire-and-forget; the popup polls GET_STATE for result.
      loop.runOnce().catch((e) => storage.recordError(String(e)))
      return stateNow()
  }
}

async function stateNow(): Promise<SwToPopup> {
  const cur = await storage.getAll()
  return {
    type: 'STATE',
    enabled: cur.enabled,
    sent: cur.stats.sent,
    dailyLimit: cur.config.dailyLimit,
    errors: cur.stats.errors,
    lastErrorMsg: cur.stats.lastErrorMsg,
    isRunning: cur.isRunning,
  }
}
