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
      return buildState(cur)
    }
    case 'TOGGLE_ENABLED':
      await storage.setEnabled(msg.enabled)
      if (msg.enabled) {
        // Click 沟通 tab ONCE on enable. Per-conversation ticks of the
        // loop assume the tab is already on chat (see runOnce).
        if (!(await loop.ensureChatTab())) {
          await storage.setEnabled(false)
          await storage.recordError('Please try to load the chat page again before enabling auto-reply.')
          return stateNow()
        }
        // Fire runOnce immediately on click — no alarm / no kickLoopSoon.
        loop.runOnce().catch((e) => storage.recordError(String(e)))
      } else {
        // Clear the error message when disabling auto-reply
        await storage.clearError()
      }
      return stateNow()
    case 'UPDATE_CONFIG':
      // No-op: API key is hardcoded in @/shared/prompt; config is not
      // user-editable in v1. Kept in the union for backward compat.
      return stateNow()
    case 'TOGGLE_RECOMMEND':
      await storage.setRecommendEnabled(msg.enabled)
      if (msg.enabled) {
        // Click 推荐牛人 tab ONCE on enable. Per-card ticks of the loop
        // assume the iframe is already mounted (see runRecommendGreetOnce).
        if (!(await loop.ensureRecommendTab())) {
          await storage.setRecommendEnabled(false)
          await storage.recordError('Please try to load the boss zhipin page again before enabling recommend-greet.')
          return stateNow()
        }
        // Fire the recommend-greet loop immediately on click.
        loop.runRecommendGreetOnce().catch((e) => storage.recordError(String(e)))
      }
      return stateNow()
    case 'CLEAR_REPLIED':
      await storage.clearReplied()
      return stateNow()
    case 'RESET_STATS':
      // Force-clear today's sent/errors counters and the recommend-greet
      // counter. The popup calls this when the user dismisses the
      // "Daily limit reached" warning.
      await storage.resetDailyStats()
      return stateNow()
    case 'RUN_ONCE':
      // Fire-and-forget; the popup polls GET_STATE for result.
      loop.runOnce().catch((e) => storage.recordError(String(e)))
      return stateNow()
  }
}

function buildState(cur: Awaited<ReturnType<typeof storage.getAll>>): SwToPopup {
  return {
    type: 'STATE',
    enabled: cur.enabled,
    sent: cur.stats.sent,
    dailyLimit: cur.config.dailyLimit,
    errors: cur.stats.errors,
    lastErrorMsg: cur.stats.lastErrorMsg,
    isRunning: cur.isRunning,
    reachedDailyLimit: cur.stats.sent >= cur.config.dailyLimit,
    recommendEnabled: cur.recommendEnabled,
    recommendGreeted: cur.recommendGreeted,
  }
}

async function stateNow(): Promise<SwToPopup> {
  const cur = await storage.getAll()
  return buildState(cur)
}
