const fs = require('fs');
const p = 'e:/projectVN/boss-zhipin/src/content/features/auto-reply/scrape.ts';
let s = fs.readFileSync(p, 'utf8');
const before = s;
// line141: `  const bubbles = $(SEL.messageBubble, pane)` -> `  const bubbles = $$(SEL.messageBubble, pane)`
const old = 'const bubbles = $(SEL.messageBubble, pane)';
const next = 'const bubbles = $$(SEL.messageBubble, pane)';
let count = 0;
while (s.includes(old)) {
 s = s.replace(old, next);
 count++;
}
if (count) {
 fs.writeFileSync(p, s);
 console.log('Replaced', count, 'occurrence(s)');
} else {
 console.log('NOT FOUND');
}
