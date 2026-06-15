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

 // === Recommend-candidates page (/web/chat/recommend) ===
 recommendCard: [
 '.card-item',
 '[class*="card-item"]',
 '.geek-item-card',
 'li[data-geekid]',
 'li[data-uid]',
 ],
 recommendName: [
 '.geek-name',
 '.name',
 '[class*="geek-name"]',
 '[class*="name"]',
 ],
 recommendJob: [
 '.source-job',
 '.job',
 '[class*="source-job"]',
 '[class*="job"]',
 ],
 recommendSalary: [
 '.salary',
 '[class*="salary"]',
 '.price',
 '[class*="price"]',
 ],
 recommendYears: [
 '[class*="year"]',
 '.experience',
 '[class*="experience"]',
 ],
 recommendEducation: [
 '[class*="education"]',
 '.edu',
 '[class*="edu"]',
 ],
 recommendActive: [
 '[class*="active"]',
 '.status',
 '[class*="status"]',
 '.online',
 ],
 recommendGreetBtn: [
 '.btn-greet',
 'button.btn-startchat',
 'button.op-btn',
 'a.op-btn',
 'button[class*="greet"]',
 'a[class*="greet"]',
 ],
 recommendConfirmBtn: [
 '.dialog-container .btn-primary',
 '.dialog-wrap .btn-primary',
 '.confirm-btn',
 'button[class*="primary"]',
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

 // Map frameId -> executionContextId for iframe evaluation.
 const contextByFrameId = new Map()
 Runtime.executionContextCreated((e) => {
 if (e.context.auxData && e.context.auxData.frameId) {
 contextByFrameId.set(e.context.auxData.frameId, e.context.id)
 }
 })

 // Wait for the page's main content to render before probing. The
 // recommend page lazy-loads candidate cards, and a too-early probe
 // would see an empty DOM and falsely report every selector as miss.
 // We poll for at least one element matching the page-type-appropriate
 // marker for up to 6 seconds.
 const onRecommend = /\/web\/chat\/recommend/.test(target.url)
 const onChatList = /\/web\/chat\/(\d+|index)/.test(target.url)
 const waitSelector = onRecommend
 ? '.card-item, [class*="card-item"], .geek-item, [class*="geek-item"]'
 : onChatList
 ? '.user-list, [role="listitem"]'
 : null
 if (waitSelector) {
 const start = Date.now()
 while (Date.now() - start < 10000) {
 const r = await Runtime.evaluate({
 expression: `document.querySelector(${JSON.stringify(waitSelector)}) !== null`,
 returnByValue: true,
 })
 if (r.result.value === true) {
 console.log(`[inspect-boss] content ready after ${Date.now() - start}ms`)
 break
 }
 await new Promise((r) => setTimeout(r, 400))
 }
}


  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

  // The recommend page renders candidate cards inside an iframe named
 // "recommendFrame". It is same-origin so we can read contentDocument
 // directly. We just have to wait for the iframe to finish loading.
 const DQ = String.fromCharCode(34); const SQ = String.fromCharCode(39); const isRecommend = target.url.includes("/web/chat/recommend")
 console.log("[inspect-boss] isRecommend:", isRecommend, "target.url:", target.url)
 if (isRecommend) {
 const iframeExpr = "document.querySelector(" + DQ + "iframe[name=" + DQ + "recommendFrame" + DQ + "], iframe[src*=" + DQ + "/web/frame/recommend" + DQ + "]" + DQ + ")"
 // Wait for iframe contentDocument to be ready (up to 10s).
 await Runtime.evaluate({
 expression: "new Promise(function(resolve){var f=" + iframeExpr + ";if(!f){resolve(false);return}var tries=0;var t=setInterval(function(){tries++;try{var d=f.contentDocument;if(d && d.readyState===" + DQ + "complete" + DQ + " && d.body && d.body.children.length>0){clearInterval(t);resolve(true)}}catch(e){}if(tries>50){clearInterval(t);resolve(false)}},200)})",
 awaitPromise: true,
 returnByValue: true,
 }).catch(function(){return {result:{value:false}}})
 // Now grab the iframe HTML.
 let iframeHtml
 try {
 iframeHtml = await Runtime.evaluate({
 expression: "(function(){var f=" + iframeExpr + ";if(!f) return null;try{return f.contentDocument.documentElement.outerHTML}catch(e){return null}})()",
 returnByValue: true,
 })
 } catch (e) {
 console.log('[inspect-boss] iframe evaluate threw:', String(e))
 }
 console.log('[inspect-boss] iframe evaluate returned:', iframeHtml ? 'present' : 'null/undefined')
 console.log('[inspect-boss] iframeHtml.result.value present:', iframeHtml.result.value ? iframeHtml.result.value.length + ' bytes' : 'null')
 if (iframeHtml.result.value) {
 fs.writeFileSync(path.join(OUT_DIR, "iframe-recommend.html"), iframeHtml.result.value)
 console.log("[inspect-boss] wrote iframe-recommend.html (" + iframeHtml.result.value.length + " bytes)")
 } else {
 console.log("[inspect-boss] could not read recommendFrame contents")
 }
 }
 
 // Force-scroll so virtualized / lazy-loaded card markup is present.
  await Runtime.evaluate({
    expression: "window.scrollTo(0, document.body.scrollHeight)",
    returnByValue: true,
  }).catch(() => {})
  await new Promise((r) => setTimeout(r, 1500))
  await Runtime.evaluate({
    expression: "window.scrollTo(0, 0)",
    returnByValue: true,
  }).catch(() => {})
  await new Promise((r) => setTimeout(r, 500))

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

  // Actionable hints when expected groups have no hits.
  const emptyGroups = Object.entries(report)
    .filter(([, e]) => e.hits.length === 0)
    .map(([n]) => n)
  if (emptyGroups.length) {
    console.log('\n=== ACTION REQUIRED ===\n')
    const needConv = emptyGroups.filter((g) =>
      ['messagePane', 'messageBubble', 'input', 'sendButton'].includes(g),
    )
    if (needConv.length) {
      console.log(' These groups need a CONVERSATION to be open on the page:')
      for (const g of needConv) console.log(' -', g)
      console.log(' -> Open any chat row in BOSS, wait for the right panel to render, then re-run this script.')
    }
    // Detect which page we are on by inspecting one DOM marker.
 const onRecommendPage = await Runtime.evaluate({
 expression: 'location.pathname.includes("/web/chat/recommend")',
 returnByValue: true,
 }).then((r) => Boolean(r.result.value)).catch(() => false)
 const onIndexPage = await Runtime.evaluate({
 expression: 'location.pathname.includes("/web/chat/index") || //web/chat/(d+)/.test(location.pathname)',
 returnByValue: true,
 }).then((r) => Boolean(r.result.value)).catch(() => false)
 const structural = emptyGroups.filter((g) =>
 ['chatListRoot', 'chatListItem', 'candidateName', 'jobTitle', 'snippet', 'timestamp', 'unreadBadge'].includes(g),
 )
    if (structural.length) {
      if (onRecommendPage) {
        console.log(' NOTE: Chat-list selectors are EXPECTED to miss on /web/chat/recommend. Only the recommend* groups matter here.')
      } else {
        console.log(' These groups missing on the LIST page suggest the URL is wrong, the chat list is in shadow DOM, or BOSS rolled a new build:')
        for (const g of structural) console.log(' -', g)
      }
    }
    // Recommend-specific diagnostic
    const recommendMiss = emptyGroups.filter((g) => g.startsWith('recommend'))
    if (recommendMiss.length) {
      console.log(' Recommend selectors missing — verify the DOM structure of /web/chat/recommend:')
      for (const g of recommendMiss) console.log(' -', g)
    }
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
