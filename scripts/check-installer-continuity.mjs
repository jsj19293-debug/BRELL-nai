import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Nightmare 4는 공식 NAIS2-Forge와 따로 설치된다: 공식 앱의 설치 폴더를 이어받지 않고,
// 공식 릴리스로 자동 업데이트하지도 않는다.
const hook = readFileSync('src-tauri/nsis/installer-hooks.nsh', 'utf8')
assert.doesNotMatch(hook, /Software\\sunakgo\\NAIS2-Forge/)
assert.doesNotMatch(hook, /StrCpy \$INSTDIR \$R0/)

const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
assert.equal(config.productName, 'Nightmare 4')
assert.equal(config.version, '4.0.0')
assert.deepEqual(config.plugins.updater.endpoints, [])
assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).version, config.version)
assert.match(readFileSync('src-tauri/Cargo.toml', 'utf8'), /^version = "4\.0\.0"$/m)

const updater = readFileSync('src/lib/app-updater.ts', 'utf8')
assert.doesNotMatch(updater, /github\.com|check\(/)

console.log('Installer checks passed: separate install, no official auto-update.')
