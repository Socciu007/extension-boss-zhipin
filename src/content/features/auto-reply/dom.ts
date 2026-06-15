// === src/content/features/auto-reply/dom.ts ===
// Selectors and DOM helpers. Each logical element has an ORDERED LIST of
// candidate selectors — try the most stable (data-attr / structural) first,
// fall back to hash-class only when needed.
//
// Last verified against a live BOSS Zhipin chat page via tools/inspect-boss.cjs
// (Chrome DevTools Protocol dump). When BOSS rolls a new build, re-run that
// script and update this file.

export const SEL = {
  // Chat list container in the center column.
  chatListRoot: [
    '.user-list',
    '.user-container',
    'ul.chat-list',
    '[role="list"]',
    '[data-component="chat-list"] ul',
  ],

  // One row in the chat list. Each row is a React <div role="listitem" key="...">
  // and lives inside a [role="group"] wrapper. The key attribute is the
  // candidate id (e.g. "760382566-0") and is stable across re-renders.
  chatListItem: [
    '#container [role="listitem"][key]',
    '[role="listitem"][key]',
    '[role="listitem"]',
    '.geek-item',
    'li[data-uid]',
    'li[data-geek-id]',
    'ul[class*="session-list"] > li',
    'ul[class*="conversation-list"] > li',
  ],

  // The red unread count inside the avatar badge (e.g. "1", "234").
  // .badge-count contains a nested <span> with the number itself.
  unreadBadge: [
    '.badge-count span',
    '.badge-count',
    '[class*="badge-count"]',
    '[class*="badge"]',
    'sup',
    'em[class*="num"]',
  ],

  // Candidate display name within a row (e.g. "申奥", "王宏嘉").
  candidateName: [
    '.geek-name',
    '[class*="geek-name"]',
    '[class*="name"]',
    '[class*="nickname"]',
    'span.title',
  ],

  // Job tag next to name (e.g. "Java", "前端").
  jobTitle: [
    '.source-job',
    '[class*="source-job"]',
    '[class*="job"]',
    '[class*="position"]',
    'span.label',
  ],

  // Last message snippet in a row. BOSS renders this as <span class="push-text">.
  snippet: [
    '.push-text',
    '[class*="push-text"]',
    '[class*="snippet"]',
    '[class*="preview"]',
    '[class*="last-msg"]',
    'p.text',
  ],

  // Timestamp on the right side of the row (e.g. "10:14", "11:22").
  timestamp: [
    '.time',
    '[class*="time"]',
    '[class*="date"]',
    'time',
  ],

  // "未读" tab/button that filters to unread only.
  unreadTab: [
    '.chat-message-filter',
    'a:has-text("未读")',
    'li:has-text("未读")',
    '[class*="tab"]:has-text("未读")',
    '[d-c]:has-text("未读")',
  ],

  // Right panel: messages area.
  // Verified: <div class="chat-message-list is-to-top"> is the list root;
  // each message is <div class="message-item">.
  messagePane: [
    '.chat-message-list',
    '[class*="chat-message-list"]',
    '[class*="message-list"]',
    '[class*="chat-body"]',
    '[class*="msg-list"]',
  ],

  // One message bubble inside the pane. BOTH system cards (.item-resume)
  // and candidate messages (.item-friend) wrap a .message-item — but we
  // only want the last candidate's text, so the caller filters.
  messageBubble: [
    '.chat-message-list .message-item',
    '.message-item',
    '[class*="message-item"]',
    '[class*="msg-item"]',
    '[class*="bubble"]',
  ],

  // Text body inside a bubble. Candidate messages use .item-friend > .text > span;
  // system cards use .message-card-top-text.
  bubbleText: [
    '.item-friend .text span',
    '.item-friend .text',
    '.message-card-top-text',
    '[class*="text"]',
    '[class*="content"]',
    'span.text',
  ],

  // Composer (contenteditable input).
  // Verified: <div id="boss-chat-editor-input" contenteditable="true" class="boss-chat-editor-input">.
  input: [
    '#boss-chat-editor-input',
    '.boss-chat-editor-input',
    '[contenteditable="true"]',
    'div[contenteditable="true"][class*="input"]',
    'div[contenteditable="true"][class*="editor"]',
  ],

  // Send button next to the composer.
  // Verified: <div class="submit-content"><div class="submit">发送</div></div>.
  // It's a div, not a button — clicking it triggers send.
  sendButton: [
    '.submit-content .submit',
    '.submit',
    '[class*="submit"]',
    'button[class*="send"]',
    'a[class*="send"]',
    '[class*="send-btn"]',
    'button[type="button"][class*="btn"]',
  ],

  // === Recommended-candidates page (/web/chat/recommend) ===
  //
  // Cards live inside an iframe named "recommendFrame" with src
  // /web/frame/recommend/... — same-origin so we can read its contentDocument
  // from the content script. Verified 2026-06-12 via tools/dump-iframe.cjs.
  //
  // One card is <div class="card-item">. Inside it:
  // <div class="candidate-card-wrap css-type-1">
  //   <div class="card-inner common-wrap css-type-1">
  //     <div class="row name-wrap">
  //       <span class="name">李龙飞</span>
  //       <span class="active-text"></span>
  //     </div>
  //     <div class="row">
  //       <div class="base-info">
  //         <span>29岁</span> <span>7年</span> <span>本科</span> ...
  //       </div>
  //     </div>
  //     <div class="row row-flex expect-wrap">
  //       <span class="label">期望</span>
  //       <span class="content">...</span>
  //     </div>
  //   </div>
  // </div>
  // ... <button class="btn btn-greet">打招呼</button>

  // One card per candidate.
  recommendCard: [
    '.card-item',
    '.candidate-card-wrap',
    '[class*="card-item"]',
  ],

  // Candidate name (e.g. "李龙飞", "张鑫").
  recommendName: [
    '.name-wrap .name',
    '.name',
  ],

  // Online / active status (e.g. "在线", "刚刚活跃", "刚刚活跃").
  // Empty <span class="active-text"></span> if inactive.
  recommendActive: [
    '.name-wrap .active-text',
    '.active-text',
    '.name-wrap [class*="active"]',
  ],

  // Years of experience (e.g. "7年"). Sits in the second <span> of
  // .base-info after the age <span>. We extract the 2nd <span>.
  recommendYears: [
    '.base-info span:nth-of-type(2)',
  ],

  // Education (e.g. "本科"). Third <span> in .base-info.
  recommendEducation: [
    '.base-info span:nth-of-type(3)',
  ],

  // "期望" (expectation) row — contains expected salary, location, job.
  recommendExpect: [
    '.expect-wrap .content',
    '.expect-wrap',
  ],

  // "打招呼" (greet) button on a single card. Verified: <button class="btn btn-greet">.
  recommendGreetBtn: [
    '.btn-greet',
    'button.btn-greet',
    'button[class*="greet"]',
  ],

  // Confirm button in the dialog that sometimes pops up after clicking greet
  // (e.g. "该用户已被您沟通过"). If absent, the click went straight through.
  recommendConfirmBtn: [
    '.dialog-container .btn-primary',
    '.dialog-wrap .btn-primary',
    '.confirm-btn',
    'button[class*="primary"]',
  ],
} as const

// Try each selector in order. Return the first match (or null).
// Useful for elements where multiple fallbacks exist.
export function $(selectors: readonly string[], root: ParentNode = document): Element | null {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel)
      if (el) return el
    } catch {
      // pseudo-classes like :has-text are not real CSS — skip silently
    }
  }
  return null
}

export function $$(selectors: readonly string[], root: ParentNode = document): Element[] {
  for (const sel of selectors) {
    try {
      const out = root.querySelectorAll(sel)
      if (out.length) return Array.from(out)
    } catch {
      // skip
    }
  }
  return []
}

// Pull an integer count from a small badge element (e.g. the red "1" next to avatar).
// Returns 0 if no number found.
export function readBadgeCount(badge: Element | null): number {
  if (!badge) return Number(0)
  const text = (badge.textContent ?? '').trim()
  const n = Number(text)
  return Number.isFinite(n) ? n : Number(0)
}

// Stable id for a row, derived from data-attrs first, then DOM position hash.
// BOSS sets `key="<uid>-<seq>"` on every row, which we treat as the primary id.
export function rowId(row: Element, index: number): string {
  const ds = (row as HTMLElement)?.dataset
  const keyAttr = (row as HTMLElement)?.getAttribute('key')
  // For a <div role="listitem" key="760382566-0">, prefer the key attribute.
  // For an <li data-uid="..."> or <li data-geek-id="...">, prefer the data-attr.
  return (
    keyAttr ??
    ds?.uid ??
    ds?.geekId ??
    ds?.id ??
    `row-${index}-${(row?.textContent ?? '').slice(0, 12).replace(/\s+/g, '')}`
  )
}
