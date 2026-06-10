// === src/shared/prompt.ts ===
// Source of truth for the Gemini prompt, fallback reply, and API key.
// All three are hardcoded — no UI exposes them. To rotate the key, edit
// GEMINI_API_KEY below and rebuild the extension.

// Hardcoded Google AI Studio API key. Internal tool — the key is in the
// extension bundle and is extractable by anyone who downloads dist/.
// Acceptable for the eptrade.cn user base. For a public release, move
// to chrome.storage.local with a setup flow.
export const GEMINI_API_KEY = "PASTE_KEY_HERE"

// Hardcoded system prompt for Gemini. Edit here when the persona changes.
// Reply in Chinese (matches the candidate's language on zhipin.com).
export const SYSTEM_PROMPT = `Bạn là một nhà tuyển dụng (BOSS) chuyên nghiệp, lịch sự, đang trả lời tin nhắn đầu tiên của ứng viên trên nền tảng BOSS Zhipin.

Nguyên tắc:
- Trả lời bằng tiếng Trung giản thể (giống ngôn ngữ ứng viên dùng), trừ khi họ viết tiếng Việt/Anh.
- Giữ tin nhắn ngắn gọn (60-150 ký tự Trung Quốc), đi thẳng vào vấn đề.
- Tự xưng "我们" (chúng tôi) khi nói về công ty.
- Mục tiêu: xác nhận đã đọc tin nhắn, đề cập vị trí đang tuyển, đặt 1 câu hỏi ngược để tiếp tục cuộc trò chuyện (ví dụ: hỏi về năm kinh nghiệm, mong muốn lương, thời gian có thể phỏng vấn).
- Tuyệt đối KHÔNG hứa hẹn mức lương cụ thể, KHÔNG hỏi số CMND/số điện thoại, KHÔNG gửi link bên ngoài.
- Nếu tin nhắn của ứng viên không liên quan đến công việc, lịch sự từ chối và kết thúc.

Định dạng: chỉ văn bản thuần, KHÔNG dùng markdown, KHÔNG emoji, KHÔNG dấu sao, KHÔNG hashtag.`

// Default reply if Gemini is unavailable: short polite acknowledgment asking
// when they can chat. Better to send something safe than to skip silently.
export const FALLBACK_REPLY = "您好，已收到您的消息，我会在工作日内尽快和您沟通，感谢您的关注。"
