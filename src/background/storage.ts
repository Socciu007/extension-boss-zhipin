// === src/background/storage.ts ===
// Typed wrapper around chrome.storage.local. All persistence goes through here.

import {
  DEFAULT_PERSISTED,
  MAX_REPLIED_CACHE,
  type Persisted,
  type Conversation,
  type AppConfig,
  todayLocal,
} from '@/shared/types'

const KEY = 'auto-reply:persisted'

// In-memory cache, refreshed on each get(). SW can be killed by Chrome, so
// every read hits chrome.storage directly — simpler and survives cold start.
export async function getAll(): Promise<Persisted> {
  const raw = await chrome.storage.local.get(KEY)
  const stored = raw[KEY] as Persisted | undefined
  if (!stored) return cloneDefault()
  // Defensive merge: ensure new fields added in newer builds still have defaults.
  return {
    ...cloneDefault(),
    ...stored,
    config: { ...cloneDefault().config, ...stored.config },
    stats: { ...cloneDefault().stats, ...stored.stats },
  }
}

export async function patch(partial: Partial<Persisted>): Promise<Persisted> {
  const cur = await getAll()
  const next: Persisted = { ...cur, ...partial }
  await chrome.storage.local.set({ [KEY]: next })
  return next
}

export async function updateConfig(c: Partial<AppConfig>): Promise<Persisted> {
  const cur = await getAll()
  return patch({ config: { ...cur.config, ...c } })
}

// === Mutual exclusion ===
//
// The chat-list reply loop (enabled) and the recommend-greet loop
// (recommendEnabled) cannot run at the same time. They both drive the
// same SW tick scheduling, share a daily limit, and would otherwise
// race on the GEMINI rate limit + the run lock. We enforce that
// here: turning one ON forces the other OFF.
//
// The two counters (sent and recommendGreeted) are still tracked
// independently so the popup can show usage. The daily limit
// applies to the sum of both.

// === Chat-list reply flow ===

export async function setEnabled(enabled: boolean): Promise<void> {
  // Mutual exclusion: enabling chat-list reply forces recommend-greet off.
  await patch(enabled ? { enabled: true, recommendEnabled: false } : { enabled: false })
}

// === Recommend (proactive greet) flow ===

export async function setRecommendEnabled(enabled: boolean): Promise<void> {
  // Mirror of setEnabled: enabling recommend forces chat-list reply off.
  await patch(enabled ? { recommendEnabled: true, enabled: false } : { recommendEnabled: false })
}

export async function bumpRecommendGreeted(): Promise<void> {
  const cur = await getAll()
  // Reset the counter if we rolled over to a new day.
  const greeted = (cur.recommendEnabled && cur.stats.date === todayLocal()) ? cur.recommendGreeted + 1 : 1
  // (The count piggy-backs on stats.date for day roll-over, but we still
  // store it as a separate field for clarity in the popup.)
  await patch({ recommendGreeted: greeted, stats: { ...cur.stats, date: todayLocal(), errors: 0, lastErrorMsg: '', lastSuccessMsg: '' } })
}

// Mark a cardId as greeted (so the loop skips it on the next
// pick). We also bump the today counter in the same call.
export async function markGreeted(cardId: string): Promise<Persisted> {
  const cur = await getAll()
  const ids = { ...cur.recommendGreetedIds, [cardId]: Date.now() }
  // LRU prune to MAX_REPLIED_CACHE entries, keeping the most recent.
  const entries = Object.entries(ids)
  if (entries.length > MAX_REPLIED_CACHE) {
    entries.sort((a, b) => b[1] - a[1])
    const keep = new Set(entries.slice(0, MAX_REPLIED_CACHE).map(([id]) => id))
    for (const [id] of entries) {
      if (!keep.has(id)) delete ids[id]
    }
  }
  const greeted = cur.stats.date === todayLocal() ? cur.recommendGreeted + 1 : 1
  return patch({ recommendGreetedIds: ids, recommendGreeted: greeted })
}

// Returns true if the candidate has been greeted today.
export async function hasGreeted(cardId: string): Promise<boolean> {
  const cur = await getAll()
  return Boolean(cur.recommendGreetedIds[cardId])
}

// Drop all greeted-cache entries (called by Reset today).
export async function clearGreetedCache(): Promise<void> {
  await patch({ recommendGreetedIds: {} })
}

// === Conversation (replied) cache with LRU prune ===

export async function markReplied(conv: Conversation): Promise<void> {
  const cur = await getAll()
  const conversations = { ...cur.conversations, [conv.id]: { ...conv, lastRepliedAt: Date.now() } }
  // LRU prune: keep the MAX_REPLIED_CACHE most recent.
  const entries = Object.values(conversations)
  if (entries.length > MAX_REPLIED_CACHE) {
    entries.sort((a, b) => b.lastRepliedAt - a.lastRepliedAt)
    const keep = new Set(entries.slice(0, MAX_REPLIED_CACHE).map((e) => e.id))
    for (const id of Object.keys(conversations)) {
      if (!keep.has(id)) delete conversations[id]
    }
  }
  await patch({ conversations })
}

export async function hasReplied(convId: string): Promise<boolean> {
  const cur = await getAll()
  return Boolean(cur.conversations[convId]?.lastRepliedAt)
}

export async function clearReplied(): Promise<void> {
  await patch({ conversations: {} })
}

// === Daily stats ===

export async function bumpSent(): Promise<void> {
  const cur = await getAll()
  const stats = ensureFreshStats(cur.stats)
  await patch({ stats: { ...stats, sent: stats.sent + 1, lastErrorMsg: '' } })
}

export async function recordError(msg: string): Promise<void> {
  const cur = await getAll()
  const stats = ensureFreshStats(cur.stats)
  await patch({ stats: { ...stats, errors: stats.errors + 1, lastErrorMsg: msg.slice(0, 200) } })
}

// Positive achievement message (e.g. daily goal reached). Surfaces as a
// success toast in the popup. Cleared by clearError / resetDailyStats /
// bumpSent (next successful send moves the user out of the "limit
// reached" state).
export async function recordSuccess(msg: string): Promise<void> {
  const cur = await getAll()
  const stats = ensureFreshStats(cur.stats)
  await patch({ stats: { ...stats, lastSuccessMsg: msg.slice(0, 200) } })
}

export async function clearError(): Promise<void> {
  const cur = await getAll()
  const stats = ensureFreshStats(cur.stats)
  await patch({ stats: { ...stats, errors: 0, lastErrorMsg: '', lastSuccessMsg: '' } })
}

// Force-reset the daily counters (sent, errors, lastErrorMsg,
// lastSuccessMsg) and the recommend-greet counter. Leaves config,
// enabled flags, conversations cache, and isRunning flag untouched.
// Useful for the "I've hit the limit but want to keep going" case.
export async function resetDailyStats(): Promise<Persisted> {
  const cur = await getAll()
  const today = todayLocal()
  const p: Partial<Persisted> = {
    stats: { date: today, sent: 0, errors: 0, lastErrorMsg: "", lastSuccessMsg: "" },
  }
  if (cur.recommendGreeted !== 0) p.recommendGreeted = 0
  p.recommendGreetedIds = {}
  return patch(p) as any
}

export async function resetDailyStatsIfStale(): Promise<Persisted> {
  const cur = await getAll()
  const stats = ensureFreshStats(cur.stats)
  // Also reset the recommend counter if day rolled over.
  const patch: Partial<Persisted> = {}
  if (stats !== cur.stats) patch.stats = stats
  if (cur.recommendGreeted !== 0 && cur.stats.date !== todayLocal()) {
    patch.recommendGreeted = 0
  }
  if (Object.keys(patch).length === 0) return cur
  return (await import('./storage')).patch(patch) as any
}

function ensureFreshStats(s: Persisted['stats']): Persisted['stats'] {
  const today = todayLocal()
  if (s.date === today) return s
  return { date: today, sent: 0, errors: 0, lastErrorMsg: '', lastSuccessMsg: '' }
}

// === Race-guard flag ===

export async function tryAcquireRunLock(): Promise<boolean> {
  const cur = await getAll()
  if (cur.isRunning) return false
  await patch({ isRunning: true })
  return true
}

export async function releaseRunLock(): Promise<void> {
  await patch({ isRunning: false })
}

// === internals ===

function cloneDefault(): Persisted {
  return JSON.parse(JSON.stringify(DEFAULT_PERSISTED))
}
