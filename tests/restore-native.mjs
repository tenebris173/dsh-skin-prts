/**
 * 「还原原生皮肤」测试：两种模式都必须真的还原。
 *
 *   A 自立模式（无控制台）：restoreNative() → 立即卸下 + 关掉启用开关（长期保持原生）
 *   B 控制台模式：restoreNative() → 本地卸下，并调用控制台 switchTo("default")（持久化归控制台）
 *
 * 用法：node tests/restore-native.mjs   （需 Chrome 以 --remote-debugging-port=9222 启动）
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')

const SKIN_ID = 'skins.prts'
const ATTR = 'data-skn-prts'
const STYLE_SEL = 'style[data-skn-prts-style]'
const STORAGE = 'dsh.skin.prts.preferences.v1'

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

// 页面侧代码一律用字符串拼接，避免嵌套模板转义问题
const harness = (withConsole) => [
  'window.__fakeReact = { createElement: function () { return {}; }, useState: function (i) { return [typeof i === "function" ? i() : i, function () {}]; }, useEffect: function () {} };',
  'window.__ModuleLoader__ = { load: function (b) { window.__mod = b.factory(function (n) { if (n === "react") return window.__fakeReact; throw new Error("ext " + n); }); } };',
  'window.__switchTo = [];',
  'window.__ctx = {',
  '  effect: function (fn) { return typeof fn === "function" ? fn() : undefined; },',
  '  logger: { warn: function () {}, info: function () {}, debug: function () {}, error: function () {} },',
  '  theme: { register: function () { return function () {} }, overrideTokens: function () { return function () {} } },',
  '  slots: { inject: function (k, cb) { cb(); return function () {} }, register: function () { return function () {} } },',
  '  locale: { register: function () { return function () {} }, bind: function () { return function (k) { return k } } },',
  '};',
  withConsole
    ? 'window.__ctx.uiSkinLoader = { registerSkin: function (reg) { window.__reg = reg; return function () {} }, switchTo: function (id) { window.__switchTo.push(id); return Promise.resolve({ ok: true }) } };'
    : '',
  'true',
].join('\n')

const STATE = [
  '(function () { try {',
  '  var api = (window.__dshSkins || {})[' + JSON.stringify(SKIN_ID) + '];',
  '  var enabled = null;',
  '  try { enabled = JSON.parse(localStorage.getItem(' + JSON.stringify(STORAGE) + ') || "{}").enabled } catch (e) { enabled = "err" }',
  '  return JSON.stringify({',
  '    styleNodes: document.querySelectorAll(' + JSON.stringify(STYLE_SEL) + ').length,',
  '    attr: document.body.getAttribute(' + JSON.stringify(ATTR) + '),',
  '    apiMode: api ? api.mode : null,',
  '    apiActive: api ? api.isActive() : null,',
  '    hasRestore: api ? typeof api.restoreNative : "no-api",',
  '    enabled: enabled,',
  '    switchTo: window.__switchTo || null',
  '  });',
  '} catch (e) { return JSON.stringify({ __stateError: String(e && e.message || e) }); } })()',
].join('\n')

for (const withConsole of [false, true]) {
  console.log(withConsole ? '控制台模式' : '自立模式（无控制台）')
  await send('Page.navigate', { url: origin })
  await wait(500)
  await evaluate(harness(withConsole))
  const loaded = await evaluate(bundle)
  if (loaded && loaded.__exception) { console.log('  bundle 加载失败: ' + loaded.__exception); failures++; continue }
  const applied = await evaluate('(function () { try { window.__mod.apply(window.__ctx); return "ok" } catch (e) { return "THREW: " + String(e && e.message || e) } })()')
  check('apply 未抛错', applied === 'ok', applied)
  await wait(600)

  if (withConsole) {
    // 控制台模式下皮肤不自行生效 —— 等控制台调 activate（这是它的职责）
    const act = await evaluate('(function () { try { window.__reg.activate({ logger: window.__ctx.logger, signal: new AbortController().signal, slots: window.__ctx.slots }); return "ok" } catch (e) { return "THREW: " + String(e && e.message || e) } })()')
    check('控制台 activate 后生效', act === 'ok', act)
    await wait(600)
  }

  const before = JSON.parse(await evaluate(STATE))
  check('皮肤已生效', before.styleNodes === 1 && before.attr === '', JSON.stringify({ nodes: before.styleNodes, attr: before.attr }))
  check('接口暴露 restoreNative()', before.hasRestore === 'function', before.hasRestore)

  const ret = await evaluate('(function () { try { window.__dshSkins[' + JSON.stringify(SKIN_ID) + '].restoreNative(); return "ok" } catch (e) { return "THREW: " + String(e && e.message || e) } })()')
  await wait(600)
  const after = JSON.parse(await evaluate(STATE))
  check('调用未抛错', ret === 'ok', ret)
  check('样式节点已归零', after.styleNodes === 0, after.styleNodes)
  check('body 标记已摘除', after.attr === null, after.attr)
  check('isActive = false', after.apiActive === false, after.apiActive)

  if (withConsole) {
    check('已请控制台切回默认观感（switchTo 收到 default）', Array.isArray(after.switchTo) && after.switchTo.indexOf('default') >= 0, JSON.stringify(after.switchTo))
  } else {
    check('自立模式：启用开关已关闭（长期保持原生）', after.enabled === false, String(after.enabled))
  }
}

console.log(failures === 0 ? '\n全部通过' : '\n' + failures + ' 项失败')
await send('Target.closeTarget', { targetId: target.id }).catch(() => {})
server.close()
process.exit(failures === 0 ? 0 : 1)
