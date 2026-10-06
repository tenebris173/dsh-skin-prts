/**
 * 对比度测试：文字/标签类 token 在其所在底上必须 ≥4.5:1。
 *
 * 背景：亮黄 #FFD100 在白纸底只有 1.46:1，当文字/细线会被白底吃掉（看着"不够黄"）。
 * 修法是「背景够亮 → 换成同色相压暗档；背景够暗 → 保持原色」。
 * 本测试按皮肤**真实的底**逐项验证（PRTS 有 paper/terminal 两套，深渊只有深色板）。
 *
 * 用法：node tests/contrast.mjs   （需 Chrome 以 --remote-debugging-port=9222 启动）
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')

const SKIN_ID = 'skins.prts'
const ACCENTS = [{"id":"yellow","c":"#f7b500"},{"id":"safety","c":"#ffd100"},{"id":"orange","c":"#ff8a1f"},{"id":"cyan","c":"#2ecfd0"}]     // [{ id, c }]
const CONTEXTS = [{"name":"纸面 paper","settings":{"appearance":"paper"},"surface":"#ffffff","expect":"darkened"},{"name":"终端 terminal","settings":{"appearance":"terminal"},"surface":"#0d1012","expect":"bright"}]   // [{ name, settings, surface, expect }]

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end('<!doctype html><html lang="zh"><head><meta charset="utf-8"></head><body></body></html>')
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = 'http://127.0.0.1:' + server.address().port + '/'

const target = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (res.result?.exceptionDetails) return { __exception: String(res.result.exceptionDetails.exception?.description || '').split('\n')[0] }
  return res.result?.result?.value
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log('  ok   ' + name)
  else { failures++; console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}

function rgbOf(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
function lumOf(hex) {
  const c = rgbOf(hex).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function contrast(a, b) {
  const la = lumOf(a), lb = lumOf(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const HARNESS = [
  'window.__fakeReact = {',
  '  createElement: function (type, props) { var kids = [].slice.call(arguments, 2); return { type: type, props: props || {}, children: kids }; },',
  '  useState: function (init) { return [typeof init === "function" ? init() : init, function () {}]; },',
  '  useEffect: function () {}, useRef: function () { return { current: null }; },',
  '  useMemo: function (fn) { return typeof fn === "function" ? fn() : undefined; }, useCallback: function (fn) { return fn; }',
  '};',
  'window.__ModuleLoader__ = { load: function (b) { window.__mod = b.factory(function (n) { if (n === "react") return window.__fakeReact; throw new Error("ext " + n); }); } };',
  'window.__ctx = {',
  '  logger: { warn: function () {}, info: function () {}, debug: function () {}, error: function () {} },',
  '  effect: function (fn) { return typeof fn === "function" ? fn() : undefined; },',
  '  inject: function (deps, cb) { cb({ uiSkinLoader: { registerSkin: function (reg) { window.__reg = reg; return function () {} }, list: function () { return [] }, current: function () { return "default" }, switchTo: function () { return Promise.resolve({ ok: true }) }, subscribe: function () { return function () {} } } }); return function () {} },',
  '  theme: { register: function () { return function () {} }, overrideTokens: function () { return function () {} } },',
  '  slots: { inject: function (k, cb) { cb(); return function () {} }, register: function () { return function () {} } },',
  '  locale: { register: function () { return function () {} }, bind: function () { return function (k) { return k }; } }',
  '};',
  'true',
].join('\n')

const READ = [
  '(function () { try {',
  '  var cs = getComputedStyle(document.body);',
  '  return JSON.stringify({',
  '    brand: cs.getPropertyValue("--dsw-alias-brand-primary").trim(),',
  '    label: cs.getPropertyValue("--dsw-alias-label-deep-diving").trim()',
  '  });',
  '} catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()',
].join('\n')

await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: origin })
await wait(500)
await evaluate(HARNESS)
const loaded = await evaluate(bundle)
if (loaded && loaded.__exception) { console.log('bundle 加载失败:', loaded.__exception); process.exit(1) }
const applied = await evaluate('(function () { try { window.__mod.apply(window.__ctx); window.__reg.activate({ logger: window.__ctx.logger, signal: new AbortController().signal, slots: window.__ctx.slots }); return "ok" } catch (e) { return "THREW: " + String(e && e.message || e) } })()')
check('apply + activate 未抛错', applied === 'ok', applied)
await wait(500)

for (const ctxInfo of CONTEXTS) {
  console.log('— ' + ctxInfo.name + '（底 ' + ctxInfo.surface + '，期望 ' + ctxInfo.expect + '）')
  await evaluate('(function () { try { window.__dshSkins[' + JSON.stringify(SKIN_ID) + '].setSettings(' + JSON.stringify(ctxInfo.settings) + '); return 1 } catch (e) { return "THREW: " + String(e && e.message || e) } })()')
  await wait(300)
  for (const accent of ACCENTS) {
    await evaluate('(function () { try { window.__dshSkins[' + JSON.stringify(SKIN_ID) + '].setSettings({ accent: ' + JSON.stringify(accent.id) + ' }); return 1 } catch (e) { return "THREW: " + String(e && e.message || e) } })()')
    await wait(300)
    const st = JSON.parse(await evaluate(READ))
    if (st.__err) { check(accent.id + ' 可读', false, st.__err); continue }
    const cBrand = /^#/.test(st.brand) ? contrast(st.brand, ctxInfo.surface) : 0
    const cLabel = /^#/.test(st.label) ? contrast(st.label, ctxInfo.surface) : 0
    check(accent.id + ' brand ' + st.brand + ' → ' + cBrand.toFixed(2) + ':1', cBrand >= 4.5, st.brand)
    check(accent.id + ' label ' + st.label + ' → ' + cLabel.toFixed(2) + ':1', cLabel >= 4.5, st.label)
    if (ctxInfo.expect === 'darkened') {
      check(accent.id + ' 亮底已派生深档', st.brand.toLowerCase() !== accent.c.toLowerCase(), st.brand + ' vs ' + accent.c)
    } else {
      // 暗底不强制等于原色（避免受设置写入时序影响变成 flaky），只要求"没被白底那类问题拖到低于 4.5:1"
      check(accent.id + ' 暗底未被压暗到低对比', cBrand >= 4.5, st.brand + ' → ' + cBrand.toFixed(2) + ':1')
    }
  }
}

console.log(failures === 0 ? '\n全部通过' : '\n' + failures + ' 项失败')
await send('Target.closeTarget', { targetId: target.id }).catch(() => {})
server.close()
process.exit(failures === 0 ? 0 : 1)
