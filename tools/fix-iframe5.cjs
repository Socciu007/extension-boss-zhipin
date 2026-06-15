const fs = require('fs');
const p = 'e:/projectVN/boss-zhipin/tools/inspect-boss.cjs';
let s = fs.readFileSync(p, 'utf8');

// Find the entire iframe extraction block and replace with a simpler
// same-origin approach: wait until contentDocument is ready, then
// dump outerHTML.
const startMarker = ' // The recommend page renders candidate cards inside an iframe named';
const endMarker = ' // Force-scroll so virtualized / lazy loaded card markup is present.';

const startIdx = s.indexOf(startMarker);
if (startIdx < 0) {
 console.log('Start marker NOT FOUND');
 process.exit(1);
}
const endIdx = s.indexOf(endMarker, startIdx);
if (endIdx < 0) {
 console.log('End marker NOT FOUND');
 process.exit(1);
}

// Build new block using simple string concat to avoid escape issues
const SQ = String.fromCharCode(39);
const LB = String.fromCharCode(123);
const RB = String.fromCharCode(125);
const DQ = String.fromCharCode(34);
const newBlock = [
 ' // The recommend page renders candidate cards inside an iframe named',
 ' // "recommendFrame". It is same-origin so we can read contentDocument',
 ' // directly. We just have to wait for the iframe to finish loading.',
 ' const isRecommend = /\\/web\\/chat\\/recommend\\//.test(target.url)',
 ' if (isRecommend) {',
 ' const iframeExpr = "document.querySelector(" + DQ + "iframe[name=" + DQ + "recommendFrame" + DQ + "], iframe[src*=" + DQ + "/web/frame/recommend" + DQ + "]" + DQ + ")"',
 ' // Wait for iframe contentDocument to be ready (up to 10s).',
 ' await Runtime.evaluate({',
 ' expression: "new Promise(function(resolve){var f=" + iframeExpr + ";if(!f){resolve(false);return}var tries=0;var t=setInterval(function(){tries++;try{var d=f.contentDocument;if(d && d.readyState===" + DQ + "complete" + DQ + " && d.body && d.body.children.length>0){clearInterval(t);resolve(true)}}catch(e){}if(tries>50){clearInterval(t);resolve(false)}},200)})",',
 ' awaitPromise: true,',
 ' returnByValue: true,',
 ' }).catch(function(){return {result:{value:false}}})',
 ' // Now grab the iframe HTML.',
 ' const iframeHtml = await Runtime.evaluate({',
 ' expression: "(function(){var f=" + iframeExpr + ";if(!f) return null;try{return f.contentDocument.documentElement.outerHTML}catch(e){return null}})()",',
 ' returnByValue: true,',
 ' })',
 ' if (iframeHtml.result.value) {',
 ' fs.writeFileSync(path.join(OUT_DIR, "iframe-recommend.html"), iframeHtml.result.value)',
 ' console.log("[inspect-boss] wrote iframe-recommend.html (" + iframeHtml.result.value.length + " bytes)")',
 ' } else {',
 ' console.log("[inspect-boss] could not read recommendFrame contents")',
 ' }',
 ' }',
 ' ',
].join('\n');

const before = s.slice(0, startIdx);
const after = s.slice(endIdx);
fs.writeFileSync(p, before + newBlock + '\n' + after);
console.log('OK, replaced ' + (endIdx - startIdx) + ' chars');
