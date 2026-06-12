// === src/background/gemini.ts ===
// Call internal LLM proxy (ai.dadaex.cn) which returns 3 reply candidates in
// a custom string format. v1 internal tool — endpoint is whitelisted via
// host_permissions in manifest.config.ts.

import type { Conversation } from "@/shared/types"
import { FALLBACK_REPLY } from "@/shared/prompt"
import axios from "axios"

const ENDPOINT = "http://ai.dadaex.cn/backapi/chatGpt/chatAll"

export async function generateReply(
  conv: Conversation,
  candidateMessage: string,
): Promise<string> {
  const content = `职位：${conv.jobTitle || "未知"}。\n候选人最新留言：${candidateMessage || conv.lastSnippet}。\n作为雇主，请简要回复，并按以下格式提交您的回复：{option1：，option2：，option3：}：`
  const result = await axios.post(ENDPOINT, {
    content,
    modelType: '2',
    modeName: 'gemini-3.5-flash',
  })

  // Response shape:
  // { data: { res1: { kwargs: { content: "{option1：..., option2：..., option3：...}" } } } }
  // The inner `content` is a STRING, not a JSON array. It uses full-width
  // comma (U+FF0C) and Chinese colon (U+FF1A) as delimiters. We can't
  // JSON.parse it — extract via regex.
  const raw: string =
    result?.data?.data?.res1?.kwargs?.content ?? ''

  const options = parseOptionString(raw)
  if (options.length === 0) {
    // Defensive: if the model didn't follow the format, return the raw
    // string (or a fallback) rather than crashing the loop.
    console.warn('[bg/gemini] no options parsed from response, raw:', raw.slice(0, 120))
    return raw || FALLBACK_REPLY
  }

  // Randomly pick one of the 3 options.
  const pick = options[Math.floor(Math.random() * options.length)]
  return pick || FALLBACK_REPLY
}

// Parse "{option1：text1，option2：text2，option3：text3}" into ["text1","text2","text3"].
// Tolerates the model inserting extra commas/breaks inside any single option.
function parseOptionString(raw: string): string[] {
  if (!raw) return []
  // Strip the surrounding braces.
  const inner = raw.replace(/^\s*\{/, '').replace(/\}\s*$/, '')
  // Split on the option markers. Each marker is "option1：" / "option2：" / "option3："
  // (full-width colon U+FF1A). We keep the regex loose in case the model
  // adds whitespace or uses an ASCII colon.
  const parts = inner
    .split(/option\s*\d+\s*[:：]/)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts
}
