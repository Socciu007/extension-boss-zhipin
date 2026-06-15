const fs = require('fs');
const p = 'e:/projectVN/boss-zhipin/tools/inspect-boss.cjs';
let s = fs.readFileSync(p, 'utf8');

// Read whole file and find/replace the exact iframe block by line range
const lines = s.split('\n');
// Replace lines 214-232 (0-indexed: 213-231) with new block
const newBlock = [
 ' const isRecommend = /\\/web\\/chat\\/recommend\\//.test(target.url)',
 ' if (isRecommend) {',
 ' // Cross-origin iframes can\\'t be reached via contentDocument. Use the',
 ' // CDP frame tree to find the recommendFrame\\'s executionContextId,',
 ' // then Runtime.evaluate against that context.',
 ' const { frameTree } = await Page.getFrameTree()',
 ' const findFrame = (node) => {',
 ' if (node.frame.url && /\\/web\\/frame\\/recommend/.test(node.frame.url)) return node',
 ' for (const c of node.childFrames || []) {',
 ' const f = findFrame(c)',
 ' if (f) return f',
 ' }',
 ' return null',
 ' }',
 ' const frame = findFrame(frameTree)',
 ' if (frame) {',
 ' const { result } = await Runtime.evaluate({',
 ' expression: \\'document.documentElement.outerHTML\\',',
 ' contextId: frame.frame.id,',
 ' returnByValue: true,',
 ' })',
 ' if (result.value) {',
 ' fs.writeFileSync(path.join(OUT_DIR, \\'iframe-recommend.html\\'), result.value)',
 ' console.log(\\'[inspect-boss] wrote iframe-recommend.html (\\' + result.value.length + \\' bytes)\\')',
 ' } else {',
 ' console.log(\\'[inspect-boss] recommendFrame evaluate returned no value\\')',
 ' }',
 ' } else {',
 ' console.log(\\'[inspect-boss] recommendFrame not found in frame tree\\')',
 ' }',
 ' }',
];
const newS = lines.slice(0, 213).concat(newBlock).concat(lines.slice(232));
fs.writeFileSync(p, newS.join('\n'));
console.log('OK');
