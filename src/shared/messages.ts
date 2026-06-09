// === src/shared/messages.ts ===
// Message types for chrome.runtime.sendMessage between content script and SW.
// Keep payloads small; SW is the one that holds state.

import type { Conversation, AppConfig } from './types'

type SwToContent =
  | { type: 'PING' }
  | { type: 'SCRAPE_UNREAD' }
  | { type: 'OPEN_CONV'; convId: string }
  | { type: 'READ_LAST_MESSAGE'; convId: string }
  | { type: 'SEND_REPLY'; convId: string; text: string }
  | { type: 'TEST_SELECTORS' }

type ContentToSw =
  | { type: 'PONG' }
  | { type: 'UNREAD_LIST'; conversations: Conversation[] }
  | { type: 'CONV_OPENED'; convId: string }
  | { type: 'LAST_MESSAGE'; convId: string; text: string }
  | { type: 'REPLY_SENT'; convId: string; ok: boolean; error?: string }
  | { type: 'SELECTOR_TEST_RESULT'; results: SelectorTestResult[] }

type SelectorTestResult = {
  name: string
  selector: string
  matched: number
  sampleText?: string
}

type PopupToSw =
  | { type: 'GET_STATE' }
  | { type: 'TOGGLE_ENABLED'; enabled: boolean }
  | { type: 'UPDATE_CONFIG'; config: Partial<AppConfig> }
  | { type: 'CLEAR_REPLIED' }
  | { type: 'RUN_ONCE' }                       // debug: tick ngay

type SwToPopup = {
  type: 'STATE'
  enabled: boolean
  sent: number
  dailyLimit: number
  errors: number
  lastErrorMsg: string
  inActiveWindow: boolean
  isRunning: boolean
}

export type {
  SwToContent,
  ContentToSw,
  PopupToSw,
  SwToPopup,
  SelectorTestResult,
}
