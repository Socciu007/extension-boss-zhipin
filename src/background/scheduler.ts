// === src/background/scheduler.ts ===
// Pure helpers. Time-window scheduling has been removed; the loop is
// triggered manually by clicking the button on the popup.

export function jitter(minMs: number, maxMs: number): number {
 if (maxMs < minMs) [minMs, maxMs] = [maxMs, minMs]
 return Math.floor(minMs + Math.random() * (maxMs - minMs))
}
