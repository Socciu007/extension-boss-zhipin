#!/usr/bin/env node
// === tools/inspect-boss.js ===
// Dump the live DOM of an open BOSS Zhipin chat page via Chrome DevTools
// Protocol. Helps when DevTools is blocked by anti-crawling (since this runs
// through CDP — a real Chrome user session is required, no automation).
//
// Usage:
//1. Start Chrome with remote debugging enabled:
// chrome.exe --remote-debugging-port=9222
// --user-data-dir="C:\\Users\\<you>\\AppData\\Local\\Google\\Chrome\\User Data"
//
//2. Open https://www.zhipin.com/web/chat in that Chrome.
//
//3. From the project root:
// node tools/inspect-boss.js [chrome-port]
// (default port:9222)
//
// Output: dumps the live HTML of the chat list root + every row + the
// message-pane, plus a short summary of common selector candidates, so we
// can update src/content/features/auto-reply/dom.ts.

const CDP = require('chrome-remote-interface')
const fs = require('fs')
const path = require('path')

const PORT = Number(process.argv[2] ?? process.env.CDP_PORT ?? 9222)
const HOST = process.env.CDP_HOST ?? '127.0.0.1'

const OUT_DIR = path.join(__dirname, 'inspect-out')

// Candidate probes — used to verify which selector survives the latest BOSS
// build. Each probe returns { selector, count, sample }.
const PROBES = {
  chatListRoot: [
    '.user-list',
    '.user-container',
    '#container .chat-container-private .user-list',
    '#container [class*="user-list"]',
    '[role="list"]',
  ],
  chatListItem: [
    '#container [role="listitem"][key]',
    '#container [role="listitem"]',
    '#container .user-list [role="listitem"]',
    '#container .user-list > div > div',
    'li[data-uid]',
    'li[data-geek-id]',
  ],
  unreadBadge: [
    '[class*="unread-count"]',
    '[class*="unread"]',
    '[class*="badge"]',
    'sup',
    'em[class*="num"]',
  ],
  candidateName: [
    '[class*="name"]',
    '[class*="nickname"]',
    'span.title',
  ],
  jobTitle: [
    '[class*="job"]',
    '[class*="position"]',
    '[class*="position-tag"]',
    'span.label',
  ],
  snippet: [
    '[class*="snippet"]',
    '[class*="preview"]',
    '[class*="last-msg"]',
    'p.text',
  ],
  timestamp: [
    '[class*="time"]',
    '[class*="date"]',
    'time',
  ],
  messagePane: [
    '[class*="message-list"]',
    '[class*="chat-body"]',
    '[class*="msg-list"]',
  ],
  messageBubble: [
    '[class*="message-item"]',
    '[class*="msg-item"]',
    '[class*="bubble"]',
  ],
  input: [
    '[contenteditable="true"]',
  ],
  sendButton: [
    'button[class*="send"]',
    'a[class*="send"]',
    '[class*="send-btn"]',
  ],
}

async function findChatPage(targets) {
  // Find the open tab whose URL matches /web/chat on zhipin.com.
  for (const t of targets) {
    const url = t.url ?? ''
    if (/zhipin\.com\/web\/chat/.test(url)) return t
  }
  return null
}

async function main() {
  console.log('[inspect-boss] connecting to Chrome at', `${HOST}:${PORT}`)
  const targets = await CDP.List({ host: HOST, port: PORT })
  const target = await findChatPage(targets)
  if (!target) {
    console.error('[inspect-boss] no open BOSS chat tab found.')
    console.error(' Open https://www.zhipin.com/web/chat in the Chrome instance, then retry.')
    console.error(' Targets seen:')
    for (const t of targets) console.error(' -', t.type, t.url)
    process.exit(1)
  }
  console.log('[inspect-boss] target:', target.url)

  const client = await CDP({ host: HOST, port: PORT, target })
  const { Runtime, Page } = client
  await Promise.all([Runtime.enable(), Page.enable()])

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

  // Dump full document HTML (truncated).
  const fullHtml = await Runtime.evaluate({
    expression: 'document.documentElement.outerHTML',
    returnByValue: true,
  })
  fs.writeFileSync(path.join(OUT_DIR, 'document.html'), fullHtml.result.value ?? '')
  console.log('[inspect-boss] wrote document.html (', fullHtml.result.value?.length, 'bytes)')

  // Run every probe and write report.
  const report = {}
  for (const [name, selectors] of Object.entries(PROBES)) {
    const entry = { hits: [], miss: [] }
    for (const sel of selectors) {
      const r = await Runtime.evaluate({
        expression: `(() => {
 const list = document.querySelectorAll(${JSON.stringify(sel)});
 if (!list.length) return null;
 return {
 count: list.length,
 sample: list[0].outerHTML.slice(0,400),
 parentClass: list[0].parentElement?.className ?? '',
 };
 })()`,
        returnByValue: true,
      })
      if (r.result.value) {
        entry.hits.push({ selector: sel, ...r.result.value })
      } else {
        entry.miss.push(sel)
      }
    }
    report[name] = entry
  }

  // Pull first row's full HTML for selector reverse-engineering.
  const firstRow = await Runtime.evaluate({
    expression: `(() => {
 const root = document.querySelector('.user-list')
 || document.querySelector('[role="list"]')
 || document.querySelector('#container');
 if (!root) return null;
 const row = root.querySelector('[role="listitem"]')
 || root.querySelector('li[data-uid]')
 || root.querySelector('li');
 return row ? row.outerHTML : null;
 })()`,
    returnByValue: true,
  })
  if (firstRow.result.value) {
    fs.writeFileSync(path.join(OUT_DIR, 'first-row.html'), firstRow.result.value)
    console.log('[inspect-boss] wrote first-row.html')
  }

  // Pull message-pane HTML (right side).
  const pane = await Runtime.evaluate({
    expression: `(() => {
 const sel = ['[class*="message-list"]','[class*="chat-body"]','[class*="msg-list"]'];
 for (const s of sel) {
 const el = document.querySelector(s);
 if (el) return el.outerHTML.slice(0,6000);
 }
 return null;
 })()`,
    returnByValue: true,
  })
  if (pane.result.value) {
    fs.writeFileSync(path.join(OUT_DIR, 'message-pane.html'), pane.result.value)
    console.log('[inspect-boss] wrote message-pane.html')
  }

  // Pretty-print probe results.
  console.log('\n=== PROBE REPORT ===\n')
  for (const [name, entry] of Object.entries(report)) {
    console.log(`[${name}]`)
    if (entry.hits.length === 0) {
      console.log(' (no hits — add new fallback selectors)')
      for (const m of entry.miss) console.log(' miss:', m)
    } else {
      for (const h of entry.hits) {
        console.log(` hit: ${h.selector} (count=${h.count}) parent="${h.parentClass}"`)
        console.log(` sample: ${h.sample.slice(0, 120).replace(/\n/g, ' ')}…`)
      }
    }
    console.log('')
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'probe-report.json'),
    JSON.stringify(report, null, 2),
  )
  console.log('[inspect-boss] wrote probe-report.json')
  console.log('\n[inspect-boss] outputs in', OUT_DIR)

  await client.close()
}

main().catch((e) => {
  console.error('[inspect-boss] error:', e)
  process.exit(1)
})
