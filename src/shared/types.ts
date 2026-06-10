// === src/shared/types.ts ===

type ScheduleWindow = {
  days: number[]              // 0=CN..6=T7 (giống JS Date.getDay())
  start: string               // "HH:MM"
  end: string                 // "HH:MM"
}

type AppConfig = {
  model: 'gemini-2.0-flash' | 'gemini-2.5-flash'
  throttleMinMs: number        // default 2000
  throttleMaxMs: number        // default 5000
  dailyLimit: number           // default 200
  scheduleWindows: ScheduleWindow[]
  systemPrompt: string         // hardcode, không expose UI
}

type Conversation = {
  id: string                    // hash từ DOM (uid, hoặc URL fragment)
  candidateName: string         // chỉ để log
  jobTitle: string              // "Java" / "前端" — từ tag trong row
  lastSnippet: string           // 80 ký tự cuối của candidate — debug
  lastRepliedAt: number         // ms epoch; 0 nếu chưa
}

type DailyStats = {
  date: string                  // "YYYY-MM-DD" local
  sent: number
  errors: number
  lastErrorMsg: string          // rỗng nếu OK
}

type Persisted = {
  config: AppConfig
  conversations: Record<string, Conversation>   // dedupe
  stats: DailyStats
  enabled: boolean              // ON/OFF global
  isRunning: boolean            // race-guard flag
}

const DEFAULT_SCHEDULE: ScheduleWindow[] = [
  { days: [1, 2, 3, 4, 5], start: '09:00', end: '12:00' },
  { days: [1, 2, 3, 4, 5], start: '14:00', end: '18:00' },
]

const DEFAULT_CONFIG: AppConfig = {
  model: 'gemini-2.0-flash',
  throttleMinMs: 2000,
  throttleMaxMs: 5000,
  dailyLimit: 200,
  scheduleWindows: DEFAULT_SCHEDULE,
  systemPrompt: '',             // sẽ được gán từ prompt.ts ở lúc init
}

const DEFAULT_PERSISTED: Persisted = {
  config: DEFAULT_CONFIG,
  conversations: {},
  stats: { date: todayLocal(), sent: 0, errors: 0, lastErrorMsg: '' },
  enabled: false,
  isRunning: false,
}

const MAX_REPLIED_CACHE = 2000  // LRU bound

function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export type { AppConfig, ScheduleWindow, Conversation, DailyStats, Persisted }
export { DEFAULT_SCHEDULE, DEFAULT_CONFIG, DEFAULT_PERSISTED, MAX_REPLIED_CACHE, todayLocal }
