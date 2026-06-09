// === src/content/features/auto-reply/act.ts ===
// Type into the BOSS composer and click Send. Tries three strategies in order
// because BOSS has rolled multiple React composer implementations over the years.

import { SEL } from './dom'
import { waitFor, sleep, retry } from './wait'

let bootstrapped = false

export function bootstrap(): void {
  if (bootstrapped) return
  bootstrapped = true
}

export async function typeAndSend(text: string): Promise<void> {
  // Make sure send button is enabled only after the composer has the text.
  const input = (await waitFor(SEL.input, { timeout: 5000 })) as HTMLElement
  input.focus()

  await retry(() => typeInto(input, text), 3, 250)

  await sleep(150) // let React apply the new value
  const send = await waitFor(SEL.sendButton, { timeout: 3000 })
  ;(send as HTMLElement).click()
}

// Three strategies, in order of how often they work on React-based composers.
async function typeInto(input: HTMLElement, text: string): Promise<void> {
  // Strategy 1: clear, append text node, dispatch input event.
  input.textContent = ''
  input.append(document.createTextNode(text))
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))

  // Verify it actually stuck; if not, try next strategy.
  if ((input.textContent ?? '').trim() === text) return

  // Strategy 2: execCommand('insertText') — older but still works in some
  // contenteditable wrappers that ignore programmatic textNode inserts.
  input.focus()
  document.execCommand?.('insertText', false, text)
  if ((input.textContent ?? '').trim() === text) return

  // Strategy 3: dispatch a paste event with a DataTransfer. Some custom
  // composers (e.g. ProseMirror) listen to paste instead of input.
  const dt = new DataTransfer()
  dt.setData('text/plain', text)
  input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: dt }))
}
