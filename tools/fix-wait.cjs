const fs = require('fs');
const p = 'e:/projectVN/boss-zhipin/tools/inspect-boss.cjs';
let s = fs.readFileSync(p, 'utf8');

// Increase wait time + add scroll trigger to force lazy load
const old = ` if (waitSelector) {
 const start = Date.now()
 while (Date.now() - start < 6000) {
 const r = await Runtime.evaluate({
 expression: `document.querySelector(${JSON.stringify(waitSelector)}) !== null`,
 returnByValue: true,
 })
 if (r.result.value === true) {
 console.log(`[inspect-boss] content ready after ${Date.now() - start}ms`)
 break
 }
 await new Promise((r) => setTimeout(r, 300))
 }
 }`;
const newAdd = ` if (waitSelector) {
 // Trigger lazy load: scroll to bottom and back to top, wait for paint.
 await Runtime.evaluate({
 expression: 'window.scrollTo(0, document.body.scrollHeight); new Promise((r) => setTimeout(r, 500)).then(() => window.scrollTo(0, 0))',
 awaitPromise: true,
 returnByValue: true,
 }).catch(() => {})
 const start = Date.now()
 while (Date.now() - start < 10000) {
 const r = await Runtime.evaluate({
 expression: `document.querySelector(${JSON.stringify(waitSelector)}) !== null`,
 returnByValue: true,
 })
 if (r.result.value === true) {
 console.log(`[inspect-boss] content ready after ${Date.now() - start}ms`)
 break
 }
 await new Promise((r) => setTimeout(r, 400))
 }
 if (Date.now() - start >= 10000) {
 console.log('[inspect-boss] WARNING: timed out waiting for content; page may be empty')
 }
 }`;

if (s.includes(old)) {
 s = s.replace(old, newAdd);
 fs.writeFileSync(p, s);
 console.log('OK');
} else console.log('NOT FOUND');
