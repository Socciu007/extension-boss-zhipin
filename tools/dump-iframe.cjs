#!/usr/bin/env node
// === tools/dump-iframe.cjs ===
// Minimal CDP tool: connect to Chrome debug port, find the BOSS recommend
// page, wait for the recommendFrame iframe to load, dump its outerHTML.
// Output: tools/inspect-out/iframe-recommend.html

const CDP = require('chrome-remote-interface')
const fs = require('fs')
const path = require('path')

const HOST = process.env.CDP_HOST || '127.0.0.1'
const PORT = Number(process.env.CDP_PORT || 9222)
const OUT = path.join(__dirname, 'inspect-out', 'iframe-recommend.html')

;(async () => {
 const targets = await CDP.List({ host: HOST, port: PORT })
 const page = targets.find((t) => /\/web\/chat\/recommend/.test(t.url || ''))
 if (!page) {
 console.error('No open /web/chat/recommend tab found.')
 process.exit(1)
 }
 const client = await CDP({ host: HOST, port: PORT, target: page })
 const { Runtime, Page } = client
 await Promise.all([Runtime.enable(), Page.enable()])

 // Wait for the iframe to be present AND its contentDocument ready.
 const ready = await Runtime.evaluate({
 expression: `
 new Promise(function(resolve){
 var f = document.querySelector('iframe[name="recommendFrame"], iframe[src*="/web/frame/recommend"]');
 if (!f) { resolve(false); return; }
 var tries = 0;
 var t = setInterval(function(){
 tries++;
 try {
 var d = f.contentDocument;
 if (d && d.readyState === 'complete' && d.body && d.body.children.length > 0) {
 clearInterval(t); resolve(true);
 }
 } catch (e) {}
 if (tries > 50) { clearInterval(t); resolve(false); }
 }, 200);
 })
 `,
 awaitPromise: true,
 returnByValue: true,
 })
 console.log('[dump-iframe] iframe ready:', ready.result.value)

 // Grab the iframe HTML.
 const r = await Runtime.evaluate({
 expression: `
 (function(){
 var f = document.querySelector('iframe[name="recommendFrame"], iframe[src*="/web/frame/recommend"]');
 if (!f) return null;
 try { return f.contentDocument.documentElement.outerHTML; } catch (e) { return 'ERR: ' + e.message; }
 })()
 `,
 returnByValue: true,
 })
 if (r.result.value) {
 if (!fs.existsSync(path.dirname(OUT))) fs.mkdirSync(path.dirname(OUT), { recursive: true })
 fs.writeFileSync(OUT, r.result.value)
 console.log('[dump-iframe] wrote', OUT, '(', r.result.value.length, 'bytes )')
 } else {
 console.log('[dump-iframe] no content; result =', JSON.stringify(r))
 }

 await client.close()
})().catch((e) => {
 console.error('[dump-iframe] error:', e.message)
 process.exit(1)
})
