// === src/content/features/auto-reply/scrape.ts ===
// Read state from the BOSS Zhipin chat page. Pure read-only.

import { $, $$, SEL, readBadgeCount, rowId } from './dom'
import { waitFor, waitGone, sleep } from './wait'
import type { Conversation } from '@/shared/types'

let bootstrapped = false

export function bootstrap(): void {
  if (bootstrapped) return
  bootstrapped = true
  // Reserved for future setup (MutationObserver, etc.). No-op for now.
}

// Return all conversations that have an unread badge. Each item carries the
// metadata SW needs to call Gemini and to render the counter.
export function findUnread(): Conversation[] {
  const root = $(SEL.chatListRoot)
  if (!root) return []
  const rows = $$(SEL.chatListItem, root)
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
      lastSnippet: snippet.slice(0, 80),
      lastRepliedAt: 0,
    })
  })

  return out
}

// Click the conversation row and wait for the right panel to render.
export async function openConv(convId: string): Promise<HTMLElement> {
  const root = $(SEL.chatListRoot)
  if (!root) throw new Error('chat list root not found')

  const rows = $$(SEL.chatListItem, root)
  const target = rows.find((r, i) => rowId(r, i) === convId)
  if (!target) throw new Error(`row not found: ${convId}`)

  ;(target as HTMLElement).click()
  // Wait for message pane to appear (or for stale bubble to change).
  const pane = await waitFor(SEL.messagePane, { timeout: 5000 })
  // Small settle delay so the very-last bubble is from the right convo.
  await sleep(150)
  return pane as HTMLElement
}

// Pull the last message text from a conversation. Filters out system
// messages (e.g. "你已将该职位发送给...") by checking text length and class.
export function readLastCandidateMessage(pane: HTMLElement): string {
  const bubbles = $$(SEL.messageBubble, pane)
  if (bubbles.length === 0) return ''

  // BOSS renders candidate messages on the LEFT, recruiter on the RIGHT.
  // Heuristic: a bubble is "from candidate" if it's not right-aligned.
  // If we can't tell, take the last bubble regardless.
  const last = bubbles[bubbles.length - 1]
  const textEl = $(SEL.bubbleText, last)
  const text = (textEl?.textContent ?? last.textContent ?? '').trim()

  // Filter obvious system messages.
  if (text.length < 1 || text.length > 2000) return ''
  if (/^(系统通知|你已将|对方已|你已开启|本次沟通|简历已)/.test(text)) return ''

  return text
}

// Optional: switch the chat list to "未读" tab so we can iterate
// the unread set without reading the badge.
export async function focusUnreadTab(): Promise<boolean> {
  const tab = $(SEL.unreadTab)
  if (!tab) return false
  ;(tab as HTMLElement).click()
  await waitGone(['[class*="loading"]'], { timeout: 2000 }).catch(() => {})
  await sleep(200)
  return true
}
