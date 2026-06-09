// === src/background/scheduler.ts ===
// Time-window checks. Pure functions; no side effects.

import type { AppConfig, ScheduleWindow } from '@/shared/types'

const HHMM = /^(\d{1,2}):(\d{2})$/

export function isInActiveWindow(config: AppConfig, now: Date = new Date()): boolean {
  if (config.scheduleWindows.length === 0) return true // no schedule = always on
  return config.scheduleWindows.some((w) => windowMatches(w, now))
}

function windowMatches(w: ScheduleWindow, now: Date): boolean {
  if (!w.days.includes(now.getDay())) return false
  const cur = now.getHours() * 60 + now.getMinutes()
  const start = parseHHMM(w.start)
  const end = parseHHMM(w.end)
  if (start === null || end === null) return false
  return cur >= start && cur < end
}

function parseHHMM(s: string): number | null {
  const m = HHMM.exec(s.trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

// Jitter helper used by the loop for delay between replies.
export function jitter(minMs: number, maxMs: number): number {
  if (maxMs < minMs) [minMs, maxMs] = [maxMs, minMs]
  return Math.floor(minMs + Math.random() * (maxMs - minMs))
}
