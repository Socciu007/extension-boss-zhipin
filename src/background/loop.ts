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
  console.log('reply', reply)
  if (!reply || reply.type !== 'UNREAD_LIST') {
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

    const conv = await pickOneUnreplied(tabId)
    console.log('conv', conv)
    if (!conv) return

    // Open conversation, then read the last candidate message.
    const opened = await sendToTab(tabId, { type: 'OPEN_CONV', convId: conv.id })
    console.log('opened', opened)
    if (!opened || opened.type !== 'CONV_OPENED') {
      await storage.recordError(`openConv failed for ${conv.id}`)
      return
    }
    const last = await sendToTab(tabId, { type: 'READ_LAST_MESSAGE', convId: conv.id })
    console.log('lastMsg', last)
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

    console.log('replyAI', reply)
    const sent = await sendToTab(tabId, { type: 'SEND_REPLY', convId: conv.id, text: reply })
    console.log('sentMsg', sent)
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

async function findRecommendTab(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ url: "https://www.zhipin.com/web/chat/recommend*" })
  if (tabs.length === 0) return null
  return tabs[0].id ?? null
}

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
    const tabId = await findRecommendTab()
    if (!tabId) return
    const list = await sendToTab(tabId, { type: "SCRAPE_RECOMMENDED" })
    if (!list || list.type !== "RECOMMENDED_LIST" || list.candidates.length === 0) return
    const target = list.candidates[0]
    const greet = await sendToTab(tabId, { type: "GREET_CANDIDATE", cardId: target.id })
    if (!greet || greet.type !== "GREETED" || !greet.ok) {
      const err = greet && greet.type === "GREETED" ? greet.error : "unknown"
      await storage.recordError('recommend-greet failed: ' + (err ?? 'unknown'))
      return
    }
    const openerText = await buildOpener(target)
    const sent = await sendToTab(tabId, { type: "SEND_REPLY", convId: target.id, text: openerText })
    if (!sent || sent.type !== "REPLY_SENT" || !sent.ok) {
      await storage.recordError('recommend-greet send failed')
      return
    }
    await storage.bumpSent()
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

async function buildOpener(
  c: { name: string; years: string },
): Promise<string> {
  return `你好 ${c.name || ""}, 我是招聘方，看到你有 ${c.years || "?"} 年经验。方便发一份简历我评估下吗？`
}
