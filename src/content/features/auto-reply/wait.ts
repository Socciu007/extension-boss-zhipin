// === src/content/features/auto-reply/wait.ts ===
// Promise-based wait helpers. Used by scrape/act to handle async DOM updates.

import { $ } from './dom'

export type WaitOpts = {
  timeout?: number
  interval?: number
  root?: ParentNode
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// Wait for the first selector in the list to resolve to a node.
export async function waitFor(
  selectors: readonly string[],
  opts: WaitOpts = {},
): Promise<Element> {
  const timeout = opts.timeout ?? 5000
  const interval = opts.interval ?? 150
  const root = opts.root ?? document
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const el = $(selectors, root)
    if (el) return el
    await sleep(interval)
  }
  throw new Error(`waitFor timeout: ${selectors.join(' | ')}`)
}

// Wait for an element to disappear (e.g. loading spinner).
export async function waitGone(
  selectors: readonly string[],
  opts: WaitOpts = {},
): Promise<void> {
  const timeout = opts.timeout ?? 5000
  const interval = opts.interval ?? 150
  const root = opts.root ?? document
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    if (!$(selectors, root)) return
    await sleep(interval)
  }
  throw new Error(`waitGone timeout: ${selectors.join(' | ')}`)
}

// Retry an async function N times with a delay; throw the last error if all fail.
export async function retry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  delayMs = 300,
): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) await sleep(delayMs)
    }
  }
  throw lastErr
}
