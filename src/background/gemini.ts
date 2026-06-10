// === src/background/gemini.ts ===
// Call Google Gemini's REST API to generate a reply.
// API key is hardcoded (see @/shared/prompt). v1 internal tool — key is in
// the extension bundle, which is acceptable for our eptrade.cn user base.

import type { AppConfig, Conversation } from "@/shared/types"
import { GEMINI_API_KEY, FALLBACK_REPLY } from "@/shared/prompt"

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"

type Part = { text: string }
type Content = { role: "user" | "model"; parts: Part[] }

type GenerateResponse = {
  candidates?: Array<{ content?: Content }>
  error?: { message: string; code?: number }
}

export async function generateReply(
  config: AppConfig,
  conv: Conversation,
  candidateMessage: string,
): Promise<string> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "PASTE_KEY_HERE") {
    throw new Error("GEMINI_API_KEY chưa được paste vào src/shared/prompt.ts")
  }

  const url = `${ENDPOINT}/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`

  const body = {
    systemInstruction: { parts: [{ text: config.systemPrompt }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              `Ứng viên: ${conv.candidateName || "未知"}`,
              `Vị trí ứng tuyển: ${conv.jobTitle || "未知"}`,
              `Tin nhắn gần nhất của ứng viên:`,
              '"""',
              candidateMessage,
              '"""',
              "",
              "Hãy trả lời:",
            ].join("\n"),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 256,
      topP: 0.9,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
  }

  let resp: Response
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch (e) {
    throw new Error(`Gemini network error: ${(e as Error).message}`)
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "")
    throw new Error(`Gemini HTTP ${resp.status}: ${text.slice(0, 200)}`)
  }

  const json = (await resp.json()) as GenerateResponse
  if (json.error) throw new Error(`Gemini API error: ${json.error.message}`)

  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join("").trim()
  if (!text) {
    // Safety filter may have blocked everything. Fall back so we don't drop the
    // candidate silently — recruiter can edit in the live chat.
    return FALLBACK_REPLY
  }
  return text
}
