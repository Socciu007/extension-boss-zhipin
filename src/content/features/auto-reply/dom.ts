// === src/content/features/auto-reply/dom.ts ===
// Selectors and DOM helpers. Each logical element has an ORDERED LIST of
// candidate selectors — try the most stable (data-attr / structural) first,
// fall back to hash-class only when needed.
//
// ⚠️ Selectors are educated guesses from a real BOSS Zhipin chat page screenshot.
// Verify with the in-popup "Test selectors" mode after install; update this file
// when BOSS rolls a new build.

export const SEL = {
  // Chat list container in the center column.
  chatListRoot: [
    'ul.chat-list',
    'ul[class*="session-list"]',
    'ul[class*="conversation-list"]',
    '[data-component="chat-list"] ul',
  ],

  // One row in the chat list.
  chatListItem: [
    'li[data-uid]',                          // most stable if BOSS sets it
    'li[data-geek-id]',
    'ul[class*="session-list"] > li',
    'ul[class*="conversation-list"] > li',
  ],

  // The red unread badge on the avatar (carries the unread count text).
  unreadBadge: [
    '[class*="badge"]',
    '[class*="unread"]',
    'sup',
    'em[class*="num"]',
  ],

  // Candidate display name within a row.
  candidateName: [
    '[class*="name"]',
    'span.title',
  ],

  // Job tag next to name (e.g. "Java").
  jobTitle: [
    '[class*="job"]',
    '[class*="position"]',
    'span.label',
  ],

  // Last message snippet in a row.
  snippet: [
    '[class*="snippet"]',
    '[class*="preview"]',
    'p.text',
  ],

  // "未读" tab/button that filters to unread only.
  unreadTab: [
    'a:has-text("未读")',
    'li:has-text("未读")',
    '[class*="tab"]:has-text("未读")',
  ],

  // Right panel: messages area.
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

  // Composer (contenteditable input).
  input: [
    '[contenteditable="true"]',
    'div[contenteditable="true"][class*="input"]',
    'div[contenteditable="true"][class*="editor"]',
  ],

  // Send button next to the composer.
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
  if (!badge) return 0
  const text = (badge.textContent ?? '').trim()
  const n = parseInt(text, 10)
  return Number.isFinite(n) ? n : 0
}

// Stable id for a row, derived from data-attrs first, then DOM position hash.
// Same DOM → same id; reset across page reloads (which is fine because
// we re-scrape on load).
export function rowId(row: Element, index: number): string {
  const ds = (row as HTMLElement).dataset
  return (
    ds.uid ??
    ds.geekId ??
    ds.id ??
    `row-${index}-${(row.textContent ?? '').slice(0, 12).replace(/\s+/g, '')}`
  )
}
