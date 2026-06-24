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
  | { type: 'CLICK_TAB'; tab: 'chat' | 'recommend' } // click 沟通 or 推荐牛人 tab
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
  | { type: 'CLICKED_TAB'; tab: 'chat' | 'recommend'; ok: boolean; error?: string }
  | { type: 'SELECTOR_TEST_RESULT'; results: SelectorTestResult[] }

type SelectorTestResult = {
  name: string
  selector: string
  matched: number
  sampleText?: string
}

// Lightweight description of a recommended candidate on /web/chat/recommend.
// Verified 2026-06-16: BOSS card structure (inside recommendFrame iframe)
// is .card-item > .candidate-card-wrap > .card-inner. Name sits in
// .name-wrap .name, age/years/education/status are inside .base-info,
// online marker is .name-wrap .online-marker, expected salary/location/job
// are in .expect-wrap .content, highlights in .geek-desc .content, tags
// in .tags-wrap .tag-item, work history in .work-exps .timeline-item.
type RecommendedCandidate = {
  id: string // cardId, derived from data-* attribute or text fallback
  name: string
  avatarUrl: string
  // Demographics (parsed from .base-info spans).
  age: string // e.g. "28岁"
  years: string // e.g. "8年"
  education: string // e.g. "本科"
  status: string // e.g. "离职-随时到岗"
  // Expected (parsed from .expect-wrap .content, joined by "·").
  salary: string // e.g. "14-16K"
  expectLocation: string // e.g. "上海"
  expectJob: string // e.g. "Java"
  expect: string // e.g. "上海 · Java" (raw)
  // Highlights + tags.
  desc: string // "优势" — long free-text paragraph
  tags: string[] // e.g. ["211院校", "SQL", "微服务架构", "Shell", "Java"]
  // Work history (each entry is "2024.03 - 2026.03 / 锐进软件 · Java").
  workExps: string[]
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
  // Positive achievement message (e.g. "Daily goal reached! X replies
  // sent today."). Cleared by clearError / resetDailyStats / bumpSent.
  lastSuccessMsg: string
  isRunning: boolean
  // True when sent today has reached dailyLimit. Cleared at midnight by
  // resetDailyStatsIfStale. The popup uses this to surface a "limit reached"
  // toast and to prevent the user from re-enabling until tomorrow.
  reachedDailyLimit: boolean
  // True when recommendGreeted has reached dailyLimit. Independent flag
  // because the chat and recommend counters share the same dailyLimit but
  // can be in different states. Drives the Reset button for the recommend
  // row and the recommend-greet success toast.
  recommendReachedDailyLimit: boolean
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
