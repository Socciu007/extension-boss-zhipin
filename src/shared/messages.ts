// === src/shared/messages.ts ===
// Message types for chrome.runtime.sendMessage between content script and SW.
// Keep payloads small; SW is the one that holds state.

import type { Conversation, AppConfig } from './types'

type SwToContent =
 | { type: 'PING' }
 | { type: 'SCRAPE_UNREAD' }
 | { type: 'SCRAPE_RECOMMENDED' }
 | { type: 'OPEN_CONV'; convId: string }
 | { type: 'READ_LAST_MESSAGE'; convId: string }
 | { type: 'SEND_REPLY'; convId: string; text: string }
 | { type: 'GREET_CANDIDATE'; cardId: string } // click "打招呼" on recommend page
 | { type: 'TEST_SELECTORS' }

type ContentToSw =
 | { type: 'PONG' }
 | { type: 'TOGGLE_ENABLED'; enabled: boolean }
 | { type: 'UNREAD_LIST'; conversations: Conversation[] }
 | { type: 'RECOMMENDED_LIST'; candidates: RecommendedCandidate[] }
 | { type: 'CONV_OPENED'; convId: string }
 | { type: 'LAST_MESSAGE'; convId: string; text: string }
 | { type: 'REPLY_SENT'; convId: string; ok: boolean; error?: string }
 | { type: 'GREETED'; cardId: string; ok: boolean; error?: string }
 | { type: 'SELECTOR_TEST_RESULT'; results: SelectorTestResult[] }

type SelectorTestResult = {
 name: string
 selector: string
 matched: number
 sampleText?: string
}

// Lightweight description of a recommended candidate on /web/chat/recommend.
// Verified 2026-06-12: BOSS card structure (inside recommendFrame iframe)
// is .card-item > .candidate-card-wrap > .card-inner. Name sits in
// .name-wrap .name, age/years/education are inside .base-info, status
// in .name-wrap .active-text, expected salary/job in .expect-wrap .content.
type RecommendedCandidate = {
 id: string // cardId, derived from data-* attribute or text fallback
 name: string
 years: string // e.g. "7年" (extracted from 2nd .base-info span)
 education: string // e.g. "本科" (extracted from 3rd .base-info span)
 activeStatus: string // 在线/刚刚活跃/离职-随时到岗
}

type PopupToSw =
 | { type: 'GET_STATE' }
 | { type: 'TOGGLE_ENABLED'; enabled: boolean }
 | { type: 'TOGGLE_RECOMMEND'; enabled: boolean } // start/stop recommend-greet loop
 | { type: 'UPDATE_CONFIG'; config: Partial<AppConfig> }
 | { type: 'CLEAR_REPLIED' }
 | { type: 'RESET_STATS' } // force-clear today's counters
 | { type: 'RUN_ONCE' } // debug: tick ngay

type SwToPopup = {
 type: 'STATE'
 enabled: boolean
 sent: number
 dailyLimit: number
 errors: number
 lastErrorMsg: string
 isRunning: boolean
 // True when sent today has reached dailyLimit. Cleared at midnight by
 // resetDailyStatsIfStale. The popup uses this to surface a "limit reached"
 // toast and to prevent the user from re-enabling until tomorrow.
 reachedDailyLimit: boolean
 // Recommend-greet loop state
 recommendEnabled: boolean
 recommendGreeted: number // how many candidates greeted today
}

export type {
 SwToContent,
 ContentToSw,
 PopupToSw,
 SwToPopup,
 SelectorTestResult,
 RecommendedCandidate,
}
