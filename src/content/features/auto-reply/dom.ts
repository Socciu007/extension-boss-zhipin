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

  // Right panel: messages area. (Selectors not yet verified — re-run
  // tools/inspect-boss.cjs with a conversation open to verify.)
  messagePane: [
    '[class*="message-list"]',
    '[class*="chat-body"]',
    '[class*="msg-list"]',
  ],

  // One message bubble inside the pane.
  messageBubble: [
    '[class*="message-item"]',
    '[class*="msg-item"]',
    '[class*="bubble"]',
  ],

  // Text body inside a bubble.
  bubbleText: [
    '[class*="text"]',
    '[class*="content"]',
    'span.text',
  ],

  // Composer (contenteditable input). (Not yet verified.)
  input: [
    '[contenteditable="true"]',
    'div[contenteditable="true"][class*="input"]',
    'div[contenteditable="true"][class*="editor"]',
  ],

  // Send button next to the composer. (Not yet verified.)
  sendButton: [
    'button[class*="send"]',
    'a[class*="send"]',
    '[class*="send-btn"]',
    'button[type="button"][class*="btn"]',
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
