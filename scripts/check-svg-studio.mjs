// SVG 편집 창 점검: node --experimental-strip-types scripts/check-svg-studio.mjs
import assert from 'node:assert/strict'
import { previewDocument, svgFileName, svgSize, withExplicitSize, SVG_SAMPLE } from '../src/lib/svg-studio.ts'

assert.deepEqual(svgSize({ width: '400', height: '300' }), { width: 400, height: 300, viewBox: null })
assert.deepEqual(svgSize({ viewBox: '0 0 640 853' }), { width: 640, height: 853, viewBox: '0 0 640 853' })
assert.deepEqual(svgSize({ width: '320px', viewBox: '0,0,640,853' }), { width: 320, height: 427, viewBox: '0 0 640 853' })
assert.deepEqual(svgSize({ height: '100', viewBox: '0 0 200 100' }), { width: 200, height: 100, viewBox: '0 0 200 100' })
assert.deepEqual(svgSize({ width: '100%', height: '100%', viewBox: '0 0 50 20' }), { width: 50, height: 20, viewBox: '0 0 50 20' })
assert.deepEqual(svgSize({}), { width: 300, height: 150, viewBox: null })
assert.deepEqual(svgSize({ viewBox: '0 0 0 10' }), { width: 300, height: 150, viewBox: null })

assert.equal(withExplicitSize('<svg viewBox="0 0 10 10" width="5" height=\'5\'><rect/></svg>', 20, 20), '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect/></svg>')
assert.equal(withExplicitSize('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>', 3, 4), '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="4"><g/></svg>')

const doc = previewDocument(SVG_SAMPLE, 'checker', 2, false)
assert.ok(doc.includes('<svg') && doc.includes('width:600px') && doc.includes('height:300px'))
assert.ok(previewDocument('<svg/>', 'black', 1, true).includes('background:#111'))
assert.ok(previewDocument('<svg/>', 'white', 99, false, { width: 10, height: 10 }).includes('width:80px'))

assert.equal(svgFileName('logo.svg', 'png'), 'logo.png')
assert.equal(svgFileName('', 'svg'), 'image.svg')
assert.equal(svgFileName('a/b:c', 'svg'), 'a_b_c.svg')
console.log('SVG studio checks passed.')
