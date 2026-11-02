// Regression checks for upstream Mowl 1.8.0-1.8.2 ports into MDmeow.
// Run with Node.js 24+: node --experimental-strip-types scripts/test-upstream-ports.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toMarkdown } from 'mdast-util-to-markdown';
import { configureMarkdownSerializer } from '../src/markdown-serializer.ts';
import { isMermaidLanguage } from '../src/mermaid.ts';

const bullet = (text) => ({
  type: 'list', ordered: false, spread: false,
  children: [{type: 'listItem', spread: false, children: [
    {type: 'paragraph', children: [{type: 'text', value: text}]},
  ]}],
});
const paragraph = (text) => ({type:'paragraph', children:[{type:'text',value:text}]});
const serialize = (root, marker) => {
  let config;
  configureMarkdownSerializer({get: () => ({}), set: (_, value) => {config=value;}}, marker);
  return toMarkdown(root, config);
};
for (const marker of ['-', '*', '+']) {
  const root = {type:'root', children:[bullet('Alpha'), bullet('Beta'), paragraph('Tail')]};
  const actual = serialize(root, marker);
  assert.match(actual, new RegExp('^\\' + marker + ' Alpha\\n\\' + marker + ' Beta\\n\\nTail\\n$'));
  assert.equal(root.children[0].children.length, 2, 'adjacent bullet lists merged');
  console.log(`PASS adjacent lists preserve preferred '${marker}' marker`);
}
const mixed = {type:'root', children:[
  bullet('Alpha'),
  {type:'list', ordered:true, start:1, spread:false, children:[{type:'listItem',spread:false, children:[paragraph('Number')]}]},
  bullet('Beta'),
]};
const mixedOutput = serialize(mixed,'-');
assert.match(mixedOutput, /- Alpha/);
assert.match(mixedOutput, /1\. Number/);
assert.match(mixedOutput, /- Beta/);
assert.equal(mixed.children.length,3,'ordered and unordered lists remain separate');
console.log('PASS ordered list boundaries unaffected');
const media = {type:'root',children:[{type:'paragraph',children:[
  {type:'link',url:'https://example.com/?a=1&b=2',title:null,children:[{type:'text',value:'Link'}]},
]}]};
const mediaOutput = serialize(media,'-');
assert.ok(mediaOutput.includes('a=1&b=2'), 'link query parameters retained');
console.log('PASS custom link serializer retained');
assert.equal(isMermaidLanguage('mermaid'),true);
assert.equal(isMermaidLanguage('MeRmAiD'),true);
assert.equal(isMermaidLanguage('javascript'),false);
console.log('PASS Mermaid language detection');
const source = readFileSync(new URL('../src/code-editor.ts',import.meta.url),'utf8');
const match = source.match(/#selectActiveMatch\(\): void \{([\s\S]*?)\n  \}\r?\n\r?\n  #findStatus/);
assert.ok(match,'find match implementation found');
assert.match(match[1],/scrollIntoView/);
assert.doesNotMatch(match[1],/view\.focus\(\)/);
console.log('PASS previous Ctrl+F source focus repair retained');
