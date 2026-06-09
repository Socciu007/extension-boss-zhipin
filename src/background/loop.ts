// === src/background/loop.ts ===
// One tick of the auto-reply loop. Called by the alarm handler in index.ts.

import * as storage from './storage'
import * as scheduler from './scheduler'
import * as gemini from './gemini'
import { SYSTEM_PROMPT } from '@/content/features/auto-reply/prompt'
import type { Conversation } from '@/shared/types'
import type { SwToContent, ContentToSw } from '@/shared/messages'

// Find a Chrome tab that is on the BOSS chat page. Returns null if none open.
async function findZhipinTab(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ url: '*://*zhipin.com/web/chat*' })
  if (tabs.length === 0) return null
  return tabs[0].id ?? null
}

function sendToTab<T extends SwToContent>(tabId: number, msg: T): Promise<ContentToSw | null> {
  return chrome.tabs
    .sendMessage(tabId, msg)
    .then((r) => r as ContentToSw | null)
    .catch(() => null)
}

// Pick the first conversation that has not been replied to yet (or whose reply
// is older than the candidate's last snippet). Simpler version: any conv not
// in the replied cache.
async function pickOneUnreplied(tabId: number): Promise<Conversation | null> {
  const reply = await sendToTab(tabId, { type: 'SCRAPE_UNREAD' })
  if (!reply || reply.type !== 'UNREAD_LIST') return null
  for (const conv of reply.conversations) {
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
    if (!cur.config.geminiApiKey) {
      await storage.recordError('Gemini API key chưa được cấu hình')
      return
    }
    await storage.resetDailyStatsIfStale()
    const stats = (await storage.getAll()).stats
    if (stats.sent >= cur.config.dailyLimit) return
    if (!scheduler.isInActiveWindow(cur.config)) return

    const tabId = await findZhipinTab()
    if (!tabId) return

    const conv = await pickOneUnreplied(tabId)
    if (!conv) return

    // Open conversation, then read the last candidate message.
    const opened = await sendToTab(tabId, { type: 'OPEN_CONV', convId: conv.id })
    if (!opened || opened.type !== 'CONV_OPENED') {
      await storage.recordError(`openConv failed for ${conv.id}`)
      return
    }
    const last = await sendToTab(tabId, { type: 'READ_LAST_MESSAGE', convId: conv.id })
    if (!last || last.type !== 'LAST_MESSAGE' || !last.text) {
      await storage.recordError(`No candidate text for ${conv.id}`)
      return
    }

    // Use persisted system prompt (the hardcoded one) — falls back if empty.
    const configWithPrompt = {
      ...cur.config,
      systemPrompt: cur.config.systemPrompt || SYSTEM_PROMPT,
    }

    let reply: string
    try {
      reply = await gemini.generateReply(configWithPrompt, conv, last.text)
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
    const wait = scheduler.jitter(cur.config.throttleMinMs, cur.config.throttleMaxMs)
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
export function kickLoopSoon(): void {
  chrome.alarms.create('auto-reply-tick', { delayInMinutes: 1 })
}
