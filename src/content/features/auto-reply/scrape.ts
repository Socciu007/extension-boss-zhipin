// === src/content/features/auto-reply/scrape.ts ===
// Read state from the BOSS Zhipin chat page. Pure read-only.

import { $, $$, SEL, readBadgeCount, rowId } from './dom'
import { waitFor, waitGone, sleep } from './wait'
import type { Conversation } from '@/shared/types'
import type { RecommendedCandidate } from '@/shared/messages'

let bootstrapped = false

export function bootstrap(): void {
  if (bootstrapped) return
  bootstrapped = true
  // Reserved for future setup (MutationObserver, etc.). No-op for now.
}

// Return all conversations that have an unread badge. Each item carries the
// metadata SW needs to call Gemini and to render the counter.
//
// We wait briefly for the chat list root to appear, because React mounts the
// BOSS chat UI asynchronously after page load. If the SW calls SCRAPE_UNREAD
// within the first second of clicking the toggle button, the list won't be
// in the DOM yet.
export async function findUnread(): Promise<Conversation[]> {
  const root = await waitFor(SEL.chatListRoot, { timeout: 5000 }).catch(() => null)
  if (!root) {
    console.warn('[auto-reply/scrape] chat list root not found after 5s')
    // Fallback: return whatever is on the page so the SW can still get SOMETHING.
    return fallbackAllRows()
  }
  return collectRows(root as HTMLElement)
}

function fallbackAllRows(): Conversation[] {
  // Best-effort scrape: try every row-like selector at document level.
  const rows = $$(SEL.chatListItem)
  console.warn('[auto-reply/scrape] fallback scrape — rows found:', rows.length)
  return collectRows(document, rows)
}

function collectRows(scope: ParentNode, provided?: Element[]): Conversation[] {
  const rows = provided ?? $$(SEL.chatListItem, scope)
  const out: Conversation[] = []

  rows.forEach((row, i) => {
    const badge = $(SEL.unreadBadge, row)
    if (readBadgeCount(badge) <= 0) return // skip non-unread

    const name = $(SEL.candidateName, row)?.textContent?.trim() ?? ''
    const job = $(SEL.jobTitle, row)?.textContent?.trim() ?? ''
    const snippet = $(SEL.snippet, row)?.textContent?.trim() ?? ''

    out.push({
      id: rowId(row, i),
      candidateName: name,
      jobTitle: job,
      lastSnippet: snippet,
      lastRepliedAt: 0,
    })
  })

  console.log('[auto-reply/scrape] rows total:', rows.length, '| unread:', out.length)
  return out
}

// === Recommended-candidates page (/web/chat/recommend) ===

// Click the left-sidebar nav tab that corresponds to the given flow. BOSS
// is a single-page app; switching tabs re-renders the right panel (or the
// iframe, for recommend) without a full page reload. We click the <a>
// inside the relevant <dl> wrapper, then wait for the destination view's
// root element to appear.
export async function clickTab(
  tab: 'chat' | 'recommend',
): Promise<{ ok: boolean; error?: string }> {
  const sel = tab === 'chat' ? SEL.chatTab : SEL.recommendTab
  const link = $(sel) as HTMLAnchorElement | null
  if (!link) return { ok: false, error: `${tab} tab not found` }
  if (link.classList.contains('router-link-active') || link.classList.contains('router-link-exact-active')) {
    // Already on this tab; nothing to do.
    return { ok: true }
  }
  link.click()
  // Wait for the destination view's root to mount. For chat we look for
  // .user-list; for recommend we look for the recommendFrame iframe (the
  // main page can mount immediately, the iframe is what we actually want).
  const waitForSel = tab === 'chat'
    ? ['.user-list', '[role="listitem"]']
    : ['iframe[name="recommendFrame"]']
  const arrived = await waitFor(waitForSel, { timeout: 5000 }).then(Boolean).catch(() => false)
  if (!arrived) return { ok: false, error: `tab ${tab} clicked but view did not mount in 5s` }
  return { ok: true }
}

//
// Returns every candidate card on the page. Each card is a top-level
// <div class="card-item"> with name, salary band, job, and an inline
// "打招呼" button. We don't filter by status — the SW loop will skip
// cards whose buttons are disabled (e.g. already-greeted today).
export function findRecommended(): RecommendedCandidate[] {
  const recommendFrame = $(['iframe[name="recommendFrame"]']) as HTMLIFrameElement | null
  if (!recommendFrame) return []
  const recommendDoc = recommendFrame.contentDocument || recommendFrame.contentWindow?.document
  if (!recommendDoc) return []
  const cards = $$(SEL.recommendCard, recommendDoc)
  console.log('[auto-reply/scrape] recommend cards found:', cards.length)

  return cards.map((card, i) => {
    // Text helper (scoped to the card).
    const txt = (sel: readonly string[]): string =>
      $(sel, card)?.textContent?.trim() ?? ''

    // Array helper: returns array of trimmed text for each match.
    const txtAll = (sel: readonly string[]): string[] => {
      const list = $$(sel, card)
      return list.map((el) => (el.textContent ?? '').trim()).filter(Boolean)
    }
    const id =
      card?.querySelector('.card-inner')?.getAttribute('data-geekid') ??
      card?.querySelector('.card-inner')?.getAttribute('data-geek') ??
      card?.querySelector('.card-inner')?.getAttribute('data-id') ??
      `card-${i}-${(txt(SEL.recommendName) ?? '').slice(0, 16).replace(/\s+/g, '')}`


    // Avatar: prefer src attribute.
    const avatarEl = $(SEL.recommendAvatar, card) as HTMLImageElement | null
    const avatarUrl = avatarEl?.getAttribute('src') ?? ''

    // Tags: one or more .tag-item elements.
    const tags = txtAll(SEL.recommendTags)

    // Work experience: each .timeline-item has a time range + a
    // "company · job" line. Combine them into one readable string.
    const workExps = $$(SEL.recommendWorkExps, card).map((item) => {
      const time = (item.querySelector('.time .join-text-wrap')?.textContent ?? '').trim()
      const line = (item.querySelector('.content .join-text-wrap')?.textContent ?? '').trim()
      return [time, line].filter(Boolean).join(' / ')
    }).filter(Boolean)

    return {
      id,
      name: txt(SEL.recommendName),
      avatarUrl,
      age: txt(SEL.recommendAge),
      years: txt(SEL.recommendYears),
      education: txt(SEL.recommendEducation),
      status: txt(SEL.recommendStatus),
      salary: txt(SEL.recommendSalary),
      expect: txt(SEL.recommendExpect),
      expectLocation: txt(SEL.recommendExpectLocation),
      expectJob: txt(SEL.recommendExpectJob),
      desc: txt(SEL.recommendDesc),
      tags,
      workExps,
    }
  }).filter((c) => c.name.trim() !== '')
}

// Click the "打招呼" button on a single recommended card. BOSS may
// open a confirm modal first; we wait for it and click through. If
// the button is disabled (already greeted), we resolve { ok: false }.
export async function greetCandidate(cardId: string): Promise<{ ok: boolean; error?: string }> {
  const card = findCardById(cardId)
  if (!card) return { ok: false, error: 'card not found' }

  const btn = $(SEL.recommendGreetBtn, card) as HTMLButtonElement | null
  if (!btn) return { ok: false, error: 'greet button not found' }
  if (btn.disabled || btn.classList.contains('disabled')) {
    return { ok: false, error: 'already greeted or disabled' }
  }

  btn.scrollIntoView({ block: 'center' })
  btn.click()

  // Some candidates trigger a confirm dialog (e.g. "该用户已被您沟通过").
  // Try to confirm; if no dialog, that's fine.
  const confirm = await waitFor(SEL.recommendConfirmBtn, { timeout: 2000 })
    .catch(() => null)
  if (confirm) (confirm as HTMLElement).click()

  // Wait briefly for the chat panel to mount so the next operation
  // (type & send) can run without a race.
  await sleep(400)
  return { ok: true }
}

function findCardById(cardId: string): Element | null {
  const recommendFrame = $(['iframe[name="recommendFrame"]']) as HTMLIFrameElement | null
  if (!recommendFrame) return null
  const recommendDoc = recommendFrame.contentDocument || recommendFrame.contentWindow?.document
  if (!recommendDoc) return null
  const cards = $$(SEL.recommendCard, recommendDoc)
  for (const [i, c] of cards.entries()) {
    const id =
      c?.querySelector('.card-inner')?.getAttribute('data-geekid') ??
      c?.querySelector('.card-inner')?.getAttribute('data-geek') ??
      c?.querySelector('.card-inner')?.getAttribute('data-id') ??
      `card-${i}-${($(SEL.recommendName, c)?.textContent?.trim() ?? '').slice(0, 16).replace(/\s+/g, '')}`
    if (id === cardId) return c
  }
  return null
}

// Click the conversation row and wait for the right panel to render.
export async function openConv(convId: string): Promise<HTMLElement> {
  const root = await waitFor(SEL.chatListRoot, { timeout: 5000 }).catch(() => null)
  if (!root) throw new Error('chat list root not found')

  const rows = $$(SEL.chatListItem, root)
  const target = rows.find((r, i) => rowId(r, i) === convId)
  if (!target) throw new Error(`row not found: ${convId}`)

  // Click the inner .geek-item (or itself as a fallback). The outer
  // [role="listitem"] wrapper doesn't carry the click handler — we need
  // the actual row that React listens to.
  const clickable: HTMLElement =
    target.querySelector('.geek-item') ??
    target.querySelector('[data-id]') ??
    (target as HTMLElement)

  // Record the current last-bubble fingerprint so we can detect when the
  // right panel has actually swapped to the new conversation (vs returning
  // immediately because the old pane is still mounted).
  const before = fingerprintLastBubble()

  clickable.scrollIntoView({ block: 'center' })
  clickable.click()

  // Wait for the right panel to either (a) appear, or (b) replace its
  // content if it's already mounted. Polling the fingerprint is more
  // reliable than waiting for the selector to appear.
  const pane = await waitForMessagePaneSwap(before, 5000)
  if (!pane) throw new Error('message pane did not update after openConv click')

  // Small settle delay so the very-last bubble is from the right convo.
  await sleep(200)
  return pane as HTMLElement
}

// Return a short string identifying the last message-bubble's text. Used to
// detect when openConv actually swaps the conversation.
function fingerprintLastBubble(): string {
  const bubbles = $$(SEL.messageBubble)
  const last = bubbles[bubbles.length - 1]
  return last ? (last.textContent ?? '').slice(0, 32) : ''
}

// Poll until the message pane exists AND its last-bubble fingerprint
// differs from the snapshot we took before the click.
async function waitForMessagePaneSwap(
  before: string,
  timeout: number,
): Promise<HTMLElement | null> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const pane = $(SEL.messagePane) as HTMLElement | null
    if (pane) {
      const now = fingerprintLastBubble()
      // Either we have no prior fingerprint (first time), or the bubbles
      // actually changed.
      if (before === '' || (now !== '' && now !== before)) return pane
    }
    await sleep(100)
  }
  return null
}

// Pull the last message text from a conversation. Filters out system
// messages (e.g. "你已将该职位发送给...") by checking text length and class.
//
// BOSS layout:
// - <div class="item-friend"> = candidate (left side)
// - <div class="item-self"> = recruiter (right side, that's us, skip)
// - <div class="item-system"> / .item-resume = resume cards (skip)
// - <div class="item-time"> = timestamp divider (skip)
//
// Strategy: scan bubbles from LAST to FIRST, return the first candidate
// (item-friend) with non-empty text. Falls back to the last non-system
// bubble if no candidate message exists yet (e.g. only recruiter has
// spoken in the conversation).
export async function readLastCandidateMessage(pane: HTMLElement): Promise<string> {
  // The pane may be just-mounted; wait briefly for at least one bubble
  // to appear. Without this, very fast calls can race the React render.
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const probe = $(SEL.messageBubble, pane)
    if (probe) break
    await sleep(100)
  }

  const bubbles = $$(SEL.messageBubble, pane)
  if (bubbles.length === 0) return ''

  // Walk backwards and pick the most recent candidate bubble.
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]
    const text = extractBubbleText(b)
    if (!text) continue
    if (isSystemBubble(b, text)) continue
    return text
  }

  // No candidate bubble found — conversation is one-sided (recruiter only)
  // or all messages were system cards. Return the last non-system text
  // so the LLM at least sees what the latest activity was.
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]
    const text = extractBubbleText(b)
    if (text) return text
  }
  return ''
}

function extractBubbleText(b: Element): string {
  const textEl = $(SEL.bubbleText, b)
  return (textEl?.textContent ?? b.textContent ?? '').trim()
}

// Heuristic: distinguish candidate / system / recruiter bubbles.
function isSystemBubble(b: Element, text: string): boolean {
  if (text.length < 1 || text.length > 2000) return true
  const cls = b.className || ''
  if (cls.includes('item-system')) return true
  if (cls.includes('item-resume')) return true
  if (cls.includes('item-time')) return true
  if (/^(系统通知|你已将|对方已|你已开启|本次沟通|简历已)/.test(text)) return true
  return false
}

// Optional: switch the chat list to "未读" tab so we can iterate
// the unread set without reading the badge.
export async function focusUnreadTab(): Promise<boolean> {
  const tab = $(SEL.unreadTab)
  if (!tab) return false
    ; (tab as HTMLElement).click()
  await waitGone(['[class*="loading"]'], { timeout: 2000 }).catch(() => { })
  await sleep(200)
  return true
}
