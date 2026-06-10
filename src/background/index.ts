// === src/background/index.ts ===
// Service worker entry. Wires the 1-minute alarm to loop.runOnce and
// handles messages from the popup.

import * as loop from './loop'
import * as storage from './storage'
import * as scheduler from './scheduler'
import type { PopupToSw, SwToPopup } from '@/shared/messages'
import { DEFAULT_PERSISTED } from '@/shared/types'

const ALARM_NAME = 'auto-reply-tick'
const ALARM_PERIOD_MIN = 1

// Ensure default storage exists on install.
chrome.runtime.onInstalled.addListener(async () => {
  const cur = await storage.getAll()
  if (!cur.config) await storage.patch(DEFAULT_PERSISTED)
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MIN })
})

// On SW startup (after Chrome restart, browser kill, or update) — release
// the run lock. If the SW was killed mid-loop, isRunning would otherwise
// stay true forever and skip every future tick.
chrome.runtime.onStartup.addListener(() => {
  storage.releaseRunLock().catch(() => {})
  chrome.alarms.get(ALARM_NAME, (a) => {
    if (!a) chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MIN })
  })
})

// Re-create the alarm if it's missing (e.g. on the first SW load of a session).
chrome.alarms.get(ALARM_NAME, (a) => {
  if (!a) chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MIN })
  storage.releaseRunLock().catch(() => {})
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return
  loop
    .runOnce()
    .catch(async (e) => {
      await storage.recordError((e as Error).message ?? String(e))
    })
})

// Message handler from the popup.
chrome.runtime.onMessage.addListener((msg: PopupToSw, _sender, sendResponse) => {
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
        inActiveWindow: scheduler.isInActiveWindow(cur.config),
        isRunning: cur.isRunning,
      }
    }
    case 'TOGGLE_ENABLED':
      await storage.setEnabled(msg.enabled)
      if (msg.enabled) {
        // Primary trigger: fire runOnce immediately so the first reply
        // goes out within seconds, not 60s (alarm minimum).
        loop.kickLoopSoon()
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
    inActiveWindow: scheduler.isInActiveWindow(cur.config),
    isRunning: cur.isRunning,
  }
}
