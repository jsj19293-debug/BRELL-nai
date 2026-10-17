// 프롬프트 메모 색 입히기 점검: node --experimental-strip-types scripts/check-note-highlight.mjs
import assert from 'node:assert/strict'
import { highlightNote } from '../src/lib/note-highlight.ts'

const kinds = text => highlightNote(text).map(piece => `${piece.kind}:${piece.text}`)
assert.deepEqual(kinds('# 세계관\n본문'), ['h1:# 세계관', 'text:\n본문'])
assert.deepEqual(kinds('## 장소\n### 세부'), ['h2:## 장소', 'text:\n', 'h3:### 세부'])
assert.deepEqual(kinds('{{user}}는 {{char}}를 만난다'), ['macro:{{user}}', 'text:는 ', 'macro:{{char}}', 'text:를 만난다'])
assert.deepEqual(kinds('# {{user}}의 집'), ['h1:# ', 'macro:{{user}}', 'h1:의 집'])
assert.deepEqual(kinds('#해시태그 아님'), ['text:#해시태그 아님'])
assert.deepEqual(kinds('#### 네 개는 제목 아님'), ['text:#### 네 개는 제목 아님'])
assert.deepEqual(kinds('{{미완성'), ['text:{{미완성'])
assert.equal(highlightNote('a\n\nb').map(piece => piece.text).join(''), 'a\n\nb')
const long = '# 제목\n' + '{{user}} 내용 '.repeat(500)
assert.equal(highlightNote(long).map(piece => piece.text).join(''), long)
console.log('Note highlight checks passed.')
