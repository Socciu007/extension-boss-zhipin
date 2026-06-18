// === src/background/loop.ts ===
// One tick of the auto-reply loop. Called by the alarm handler in index.ts.

import * as storage from './storage'
import { jitter } from './scheduler'
import * as gemini from './gemini'
import type { Conversation } from '@/shared/types'
import type { SwToContent, ContentToSw } from '@/shared/messages'

// Find a Chrome tab that is on the BOSS chat page. Returns null if none open.
async function findZhipinTab(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ url: 'https://www.zhipin.com/web/chat*' })
  if (tabs.length === 0) return null
  return tabs[0].id ?? null
}

function sendToTab<T extends SwToContent>(tabId: number, msg: T): Promise<ContentToSw | null> {
  return chrome.tabs
    .sendMessage(tabId, msg)
    .then((r) => r as ContentToSw | null)
    .catch((e) => {
      console.warn('[bg/loop] sendToTab failed:', msg.type, String(e))
      return null
    })
}

// Pick the first conversation that has not been replied to yet (or whose reply
// is older than the candidate's last snippet). Simpler version: any conv not
// in the replied cache.
async function pickOneUnreplied(tabId: number): Promise<Conversation | null> {
  const reply = await sendToTab(tabId, { type: 'SCRAPE_UNREAD' })
  if (!reply || reply.type !== 'UNREAD_LIST' || !reply.conversations || reply.conversations.length === 0) {
    await storage.setEnabled(false)
    await storage.recordError('Please try to load the chat page again before enabling auto-reply.')
    return null
  }
  for (const conv of reply?.conversations) {
    if (!(await storage.hasReplied(conv.id))) return conv
  }
  return null
}

export async function runOnce(): Promise<void> {
  // Race guard: skip if previous tick is still running.
  if (!(await storage.tryAcquireRunLock())) return

  try {
    const cur = await storage.getAll()
    if (!cur.enabled) return
    await storage.resetDailyStatsIfStale()
    const stats = (await storage.getAll()).stats
    if (stats.sent >= cur.config.dailyLimit) {
      // Hit the daily cap. Turn off the toggle so the popup can surface a
      // toast and the next click won't re-trigger until tomorrow (when
      // resetDailyStatsIfStale clears the counter).
      if (cur.enabled) {
        await storage.setEnabled(false)
        await storage.recordError(
          `Reached daily limit ${cur.config.dailyLimit} replies/day. Auto-reply is disabled.`,
        )
      }
      return
    }
    // (No schedule check — user clicks the button to start the loop.)

    const tabId = await findZhipinTab()
    if (!tabId) return

    // Click 沟通 tab first so the chat list is mounted before we scrape.
    // No-op if the tab is already active.
    const tabRes = await sendToTab(tabId, { type: 'CLICK_TAB', tab: 'chat' })
    if (!tabRes || tabRes.type !== 'CLICKED_TAB' || !tabRes.ok) {
      await storage.setEnabled(false)
      await storage.recordError('Please try to load the chat page again before enabling auto-reply.')
      return
    }

    const conv = await pickOneUnreplied(tabId)
    if (!conv) return

    // Open conversation, then read the last candidate message.
    const opened = await sendToTab(tabId, { type: 'OPEN_CONV', convId: conv.id })
    if (!opened || opened.type !== 'CONV_OPENED') {
      await storage.recordError(`openConv failed for ${conv.id}`)
      return
    }
    const last = await sendToTab(tabId, { type: 'READ_LAST_MESSAGE', convId: conv.id })
    if (!last || last.type !== 'LAST_MESSAGE') {
      await storage.recordError(`No candidate text for ${conv.id}`)
      return
    }

    let reply: string
    try {
      reply = await gemini.generateReply(conv, last.text)
    } catch (e) {
      await storage.recordError(`Gemini: ${(e as Error).message}`)
      return
    }

    const sent = await sendToTab(tabId, { type: 'SEND_REPLY', convId: conv.id, text: reply })
    if (!sent || sent.type !== 'REPLY_SENT' || !sent.ok) {
      const errMsg = sent?.type === 'REPLY_SENT' && sent.error ? sent.error : 'unknown'
      await storage.recordError(`Send failed for ${conv.id}: ${errMsg}`)
      return
    }

    await storage.markReplied(conv)
    await storage.bumpSent()

    // Chain the next reply with human-like jitter via setTimeout. The
    // 1-minute chrome.alarms in background/index.ts is the safety net if
    // Chrome kills the SW before this fires.
    const wait = jitter(cur.config.throttleMinMs, cur.config.throttleMaxMs)
    setTimeout(() => {
      runOnce().catch(async (e: unknown) => {
        await storage.recordError((e as Error).message ?? String(e))
      })
    }, wait)
  } finally {
    await storage.releaseRunLock()
  }
}

// Public: re-arm the 1-minute alarm (used when the user toggles enabled).
// We don't use a short-delay alarm here because Chrome enforces a 30-second
// minimum delayInMinutes in production.


// === Recommend-greet loop ===
//
// Scans /web/chat/recommend, picks the first card that has not been
// greeted yet, clicks 打招呼, generates an opener, types it into the
// new chat composer, and sends. Self-chains with the same throttle
// jitter as the chat-list reply loop.
//
// Independent of the chat-list loop (runOnce): it has its own toggle
// (recommendEnabled) and its own counter (recommendGreeted).

export async function runRecommendGreetOnce(): Promise<void> {
  if (!(await storage.tryAcquireRunLock())) return
  try {
    const cur = await storage.getAll()
    if (!cur.recommendEnabled) return
    await storage.resetDailyStatsIfStale()
    if (cur.recommendGreeted >= cur.config.dailyLimit) {
      if (cur.recommendEnabled) {
        await storage.setRecommendEnabled(false)
        await storage.recordError(
          `Limit reached ${cur.config.dailyLimit} greetings today. Recommend-greet is disabled.`,
        )
      }
      return
    }
    const tabId = await findZhipinTab()
    if (!tabId) return
    // Click 推荐牛人 tab first so the iframe with candidate cards mounts.
    const tabRes = await sendToTab(tabId, { type: "CLICK_TAB", tab: "recommend" })
    if (!tabRes || tabRes.type !== "CLICKED_TAB" || !tabRes.ok) {
      await storage.setEnabled(false)
      await storage.recordError('Please try to load the boss zhipin page again before enabling recommend-greet.')
      return
    }
    const list = await sendToTab(tabId, { type: "SCRAPE_RECOMMENDED" })
    if (!list || list.type !== "RECOMMENDED_LIST" || list.candidates.length === 0) return
    // Skip candidates already greeted today (in the local cache).
    const greetedIds = new Set(Object.keys((await storage.getAll()).recommendGreetedIds))
    const candidates = list.candidates.filter((c) => !greetedIds.has(c.id))
    if (candidates.length === 0) return
    const target = candidates[0]
    const greet = await sendToTab(tabId, { type: "GREET_CANDIDATE", cardId: target.id })
    console.log('greet', greet)
    if (!greet || greet.type !== "GREETED" || !greet.ok) {
      const err = greet && greet.type === "GREETED" ? greet.error : "unknown"
      await storage.recordError('recommend-greet failed: ' + (err ?? 'unknown'))
      return
    }

    // Mark this card as greeted so the loop won't pick it again today.
    await storage.markGreeted(target.id)
    await storage.bumpRecommendGreeted()
    const wait = jitter(cur.config.throttleMinMs, cur.config.throttleMaxMs)
    setTimeout(() => {
      runRecommendGreetOnce().catch(async (e: unknown) => {
        await storage.recordError((e as Error).message ?? String(e))
      })
    }, wait)
  } finally {
    await storage.releaseRunLock()
  }
}