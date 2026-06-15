// === src/shared/types.ts ===

type AppConfig = {
  model: 'gemini-3.5-flash' | 'gemini-2.5-flash'
  throttleMinMs: number // default2000
  throttleMaxMs: number // default5000
  dailyLimit: number // default200
  systemPrompt: string // hardcode, không expose UI
}

type Conversation = {
  id: string // hash từ DOM (uid, hoặc URL fragment)
  candidateName: string // chỉ để log
  jobTitle: string // "Java" / "前端" — từ tag trong row
  lastSnippet: string //80 ký tự cuối của candidate — debug
  lastRepliedAt: number // ms epoch;0 nếu chưa
}

type DailyStats = {
  date: string // "YYYY-MM-DD" local
  sent: number
  errors: number
  lastErrorMsg: string // rỗng nếu OK
}

type Persisted = {
  config: AppConfig
  conversations: Record<string, Conversation> // dedupe
  stats: DailyStats
  enabled: boolean // ON/OFF global
  isRunning: boolean // race-guard flag
}

const DEFAULT_CONFIG: AppConfig = {
  model: 'gemini-2.5-flash',
  throttleMinMs: 2000,
  throttleMaxMs: 5000,
  dailyLimit: 100,
  systemPrompt: '',
}

const DEFAULT_PERSISTED: Persisted = {
  config: DEFAULT_CONFIG,
  conversations: {},
  stats: { date: todayLocal(), sent: 0, errors: 0, lastErrorMsg: '' },
  enabled: false,
  isRunning: false,
}

const MAX_REPLIED_CACHE = 2000 // LRU bound

function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export type { AppConfig, Conversation, DailyStats, Persisted }
export { DEFAULT_CONFIG, DEFAULT_PERSISTED, MAX_REPLIED_CACHE, todayLocal }
