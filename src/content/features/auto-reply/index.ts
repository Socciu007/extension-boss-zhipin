// === src/content/features/auto-reply/index.ts ===
// Content script entry for the BOSS Zhipin auto-reply feature.
// Acts as the SW's "hands & eyes" — runs scrape/act commands on request.

import * as scrape from './scrape'
import * as act from './act'
import type { SwToContent, ContentToSw, SelectorTestResult } from '@/shared/messages'
import { SEL, $$, $ } from './dom'

const URL_MATCH = /^\/web\/chat(\/|$)/

function isTargetPage(): boolean {
  return URL_MATCH.test(location.pathname) && location.host.endsWith('zhipin.com')
}

function bootstrap(): void {
  if (!isTargetPage()) return
  scrape.bootstrap()
  act.bootstrap()
  console.log('[auto-reply] content script ready on', location.pathname)
}

// Send a reply back to the SW. Returns the response payload.
function reply<T extends ContentToSw>(msg: T): void {
  chrome.runtime.sendMessage(msg).catch((e) => console.warn('[auto-reply] sendMessage failed', e))
}

chrome.runtime.onMessage.addListener((msg: SwToContent, _sender, sendResponse) => {
  if (!isTargetPage()) return false

  switch (msg.type) {
    case 'PING':
      sendResponse({ type: 'PONG' })
      return false

    case 'SCRAPE_UNREAD': {
      const list = scrape.findUnread()
      reply({ type: 'UNREAD_LIST', conversations: list })
      sendResponse({ ok: true, count: list.length })
      return false
    }

    case 'OPEN_CONV':
      scrape
        .openConv(msg.convId)
        .then((pane) => {
          reply({ type: 'CONV_OPENED', convId: msg.convId })
          sendResponse({ ok: true, hasPane: !!pane })
        })
        .catch((e) => sendResponse({ ok: false, error: String(e) }))
      return true // keep channel open for async sendResponse

    case 'READ_LAST_MESSAGE': {
      // Re-find pane: SW calls this AFTER OPEN_CONV succeeded.
      const pane = document.querySelector(SEL.messagePane[0]) as HTMLElement | null
      const text = pane ? scrape.readLastCandidateMessage(pane) : ''
      reply({ type: 'LAST_MESSAGE', convId: msg.convId, text })
      sendResponse({ ok: true, text })
      return false
    }

    case 'SEND_REPLY':
      act
        .typeAndSend(msg.text)
        .then(() => {
          reply({ type: 'REPLY_SENT', convId: msg.convId, ok: true })
          sendResponse({ ok: true })
        })
        .catch((e) => {
          reply({ type: 'REPLY_SENT', convId: msg.convId, ok: false, error: String(e) })
          sendResponse({ ok: false, error: String(e) })
        })
      return true

    case 'TEST_SELECTORS': {
      const results: SelectorTestResult[] = Object.entries(SEL).map(([name, list]) => {
        const matched = $$(list as readonly string[]).length
        const first = $(list as readonly string[])
        return {
          name,
          selector: (list as readonly string[]).join(' | '),
          matched,
          sampleText: first?.textContent?.trim().slice(0, 60),
        }
      })
      reply({ type: 'SELECTOR_TEST_RESULT', results })
      sendResponse({ ok: true, results })
      return false
    }
  }
})

if (document.readyState === 'complete') {
  bootstrap()
} else {
  window.addEventListener('load', bootstrap, { once: true })
}
