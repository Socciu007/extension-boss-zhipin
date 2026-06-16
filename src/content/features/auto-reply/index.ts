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

    // Wrap the whole handler in an async IIFE so we can use await for
    // SCRAPE_UNREAD without making chrome.runtime.onMessage's callback itself
    // return a promise (Chrome only honours `return true` to keep the channel
    // open for sendResponse, not a returned promise).
    ; (async () => {
      switch (msg.type) {
        case 'PING':
          sendResponse({ type: 'PONG' })
          return

        case 'SCRAPE_UNREAD': {
          const list = await scrape.findUnread()
          reply({ type: 'UNREAD_LIST', conversations: list })
          sendResponse({ type: 'UNREAD_LIST', conversations: list })
          return
        }

        case 'SCRAPE_RECOMMENDED': {
          const candidates = scrape.findRecommended()
          reply({ type: 'RECOMMENDED_LIST', candidates })
          sendResponse({ type: 'RECOMMENDED_LIST', candidates })
          return
        }

        case 'CLICK_TAB': {
          const res = await scrape.clickTab(msg.tab)
          reply({ type: 'CLICKED_TAB', tab: msg.tab, ok: res.ok, error: res.error })
          sendResponse({ type: 'CLICKED_TAB', tab: msg.tab, ok: res.ok, error: res.error })
          return
        }

        case 'GREET_CANDIDATE': {
          const res = await scrape.greetCandidate(msg.cardId)
          reply({ type: 'GREETED', cardId: msg.cardId, ok: res.ok, error: res.error })
          sendResponse({ type: 'GREETED', cardId: msg.cardId, ok: res.ok, error: res.error })
          return
        }

        case 'OPEN_CONV': {
          const pane = await scrape.openConv(msg.convId)
          reply({ type: 'CONV_OPENED', convId: msg.convId })
          sendResponse({ type: 'CONV_OPENED', convId: msg.convId, hasPane: !!pane })
          return
        }

        case 'READ_LAST_MESSAGE': {
          const pane = document.querySelector(SEL.messagePane[0]) as HTMLElement | null
          const text = pane
            ? await scrape.readLastCandidateMessage(pane)
            : ''
          reply({ type: 'LAST_MESSAGE', convId: msg.convId, text })
          sendResponse({ type: 'LAST_MESSAGE', convId: msg.convId, text })
          return
        }

        case 'SEND_REPLY': {
          await act.typeAndSend(msg.text)
          reply({ type: 'REPLY_SENT', convId: msg.convId, ok: true })
          sendResponse({ type: 'REPLY_SENT', convId: msg.convId, ok: true })
          return
        }

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
          return
        }
      }
    })()
  return true // always keep channel open for sendResponse
})

if (document.readyState === 'complete') {
  bootstrap()
} else {
  window.addEventListener('load', bootstrap, { once: true })
}
