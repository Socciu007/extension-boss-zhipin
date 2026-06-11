// === src/content/features/auto-reply/dom.ts ===
// Selectors and DOM helpers. Each logical element has an ORDERED LIST of
// candidate selectors — try the most stable (data-attr / structural) first,
// fall back to hash-class only when needed.
//
// ⚠️ Selectors are educated guesses from a real BOSS Zhipin chat page screenshot.
// Verify with the in-popup "Test selectors" mode after install; update this file
// when BOSS rolls a new build.

export const SEL = {
 chatListRoot: [
 '.user-list',
 '.user-container',
 'ul.chat-list',
 '[role="list"]',
 '[data-component="chat-list"] ul',
 ],

 chatListItem: [
 '[role="listitem"][key]',
 '[role="listitem"]',
 '.user-list > div > div',
 'li[data-uid]',
 'li[data-geek-id]',
 'ul[class*="session-list"] > li',
 'ul[class*="conversation-list"] > li',
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

 unreadTab: [
 '.chat-message-filter',
 'a:has-text("未读")',
 'li:has-text("未读")',
 '[class*="tab"]:has-text("未读")',
 '[d-c]:has-text("未读")',
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

 bubbleText: [
 '[class*="text"]',
 '[class*="content"]',
 'span.text',
 ],

 input: [
 '[contenteditable="true"]',
 'div[contenteditable="true"][class*="input"]',
 'div[contenteditable="true"][class*="editor"]',
 ],

 sendButton: [
 'button[class*="send"]',
 'a[class*="send"]',
 '[class*="send-btn"]',
 'button[type="button"][class*="btn"]',
 ],
} as const

export function $(selectors: readonly string[], root: ParentNode = document): Element | null {
 for (const sel of selectors) {
 try {
 const el = root.querySelector(sel)
 if (el) return el
 } catch {
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
 }
 }
 return []
}

export function readBadgeCount(badge: Element | null): number {
 if (!badge) return Number(0)
 const text = (badge.textContent ?? '').trim()
 const n = Number(text)
 return Number.isFinite(n) ? n : Number(0)
}

export function rowId(row: Element, index: number): string {
 const ds = (row as HTMLElement).dataset
 return (
 ds.uid ??
 ds.geekId ??
 ds.id ??
 ds.key ??
 (row as HTMLElement).getAttribute('key') ??
 `row-${index}-${(row.textContent ?? '').slice(0,12).replace(/\s+/g, '')}`
 )
}
