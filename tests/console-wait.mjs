/**
 * 控制台等待测试（这次的回归闸门）：
 *
 *   A 控制台**迟到**（1 秒后才 provide）→ 必须登记托管、不许误判成"没有控制台"走自立
 *      （上一版就是 apply 时"看一眼"，服务还没 provide → 误判 → 控制台里看不到皮肤）
 *   B 控制台**始终不出现** → 3 秒宽限后自立：自动应用外观 + 面板选择器给「原生 / 本皮肤」，
 *      选「原生」立即还原成默认皮肤
 *
 * 用法：node tests/console-wait.mjs   （需 Chrome 以 --remote-debugging-port=9222 启动）
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
// 轮询等待：定时器与事件循环在 CI 上会抖，固定 sleep 容易 flaky（这个测试就踩过）
const waitFor = async (pred, ms = 8000) => {
  const t0 = Date.now()
  let last = JSON.parse(await evaluate(STATE))
  while (Date.now() - t0 < ms) {
    if (pred(last)) return last
    await wait(150)
    last = JSON.parse(await evaluate(STATE))
  }
  return last
}

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log('  ok   ' + name)
  else { failures++; console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}

// 假 React + 假 ctx；ctx.inject 只记录回调，由测试决定何时"服务出现"
const HARNESS = [
  'window.__fakeReact = {',
  '  createElement: function (type, props) { var kids = [].slice.call(arguments, 2); return { type: type, props: props || {}, children: kids }; },',
  '  useState: function (init) { return [typeof init === "function" ? init() : init, function () {}]; },',
  '  useEffect: function () {}',
  '};',
  'window.__ModuleLoader__ = { load: function (b) { window.__mod = b.factory(function (n) { if (n === "react") return window.__fakeReact; throw new Error("ext " + n); }); } };',
  'window.__injectCallbacks = [];',
  'window.__registered = [];',
  'window.__activated = 0;',
  'window.__section = null;',
  'window.__ctx = {',
  '  logger: { warn: function () {}, info: function () {}, debug: function () {}, error: function () {} },',
  '  effect: function (fn) { return typeof fn === "function" ? fn() : undefined; },',
  '  inject: function (deps, cb) { window.__injectCallbacks.push({ deps: deps, cb: cb }); return function () {} },',
  '  theme: { register: function () { return function () {} }, overrideTokens: function () { return function () {} } },',
  '  slots: {',
  '    inject: function (key, cb) { cb(); return function () {} },',
  '    register: function (opts, comp) { window.__section = comp; return function () {} }',
  '  },',
  '  locale: { register: function () { return function () {} }, bind: function () { return function (k) { return k }; } }',
  '};',
  'window.__provideConsole = function () {',
  '  var api = {',
  '    registerSkin: function (reg) { window.__registered.push(reg.id); return function () {} },',
  '    list: function () { return [{ id: "skins.abyssal", name: "A" }, { id: "skins.prts", name: "P" }] },',
  '    current: function () { return "skins.prts" },',
  '    switchTo: function () { return Promise.resolve({ ok: true }) },',
  '    subscribe: function () { return function () {} }',
  '  };',
  '  window.__injectCallbacks.forEach(function (entry) { try { entry.cb({ uiSkinLoader: api }) } catch (e) { window.__injectError = String(e && e.message || e) } });',
  '  return true;',
  '};',
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
  '    mode: api ? api.mode : null,',
  '    active: api ? api.isActive() : null,',
  '    enabled: enabled,',
  '    standaloneStored: (function () { try { return localStorage.getItem("dsh.skin.standalone.v1"); } catch (e) { return "err"; } })(),',
  '    registered: window.__registered,',
  '    injectCalls: window.__injectCallbacks.length,',
  '    injectDeps: window.__injectCallbacks[0] ? window.__injectCallbacks[0].deps : null,',
  '    hasSection: typeof window.__section === "function"',
  '  });',
  '} catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()',
].join('\n')

const SELECT_INFO = [
  '(function () {',
  '  function walk(node, out) {',
  '    if (!node || typeof node !== "object") return out;',
  '    if (typeof node.type === "function") { try { return walk(node.type(node.props || {}), out) } catch (e) { return out } }',
  '    var props = node.props || {};',
  '    if (node.type === "select" && props["aria-label"] === "settings.skin") {',
  '      var raw = props.children || [];',
  '      var flat = [];',
  '      for (var q = 0; q < raw.length; q++) { if (Array.isArray(raw[q])) flat = flat.concat(raw[q]); else flat.push(raw[q]); }',
  '      window.__sel = props;',
  '      out.push({ value: props.value, options: flat.map(function (o) { return o && o.props ? o.props.value : null }) });',
  '    }',
  '    var kids = node.children || [];',
  '    var f2 = [];',
  '    for (var j = 0; j < kids.length; j++) { if (Array.isArray(kids[j])) f2 = f2.concat(kids[j]); else f2.push(kids[j]); }',
  '    for (var i = 0; i < f2.length; i++) walk(f2[i], out);',
  '    return out;',
  '  }',
  '  try { var found = walk(window.__section(), []); return JSON.stringify({ count: found.length, value: found[0] ? found[0].value : null, options: found[0] ? found[0].options : [] }); }',
  '  catch (e) { return JSON.stringify({ err: String(e && e.message || e) }); }',
  '})()',
].join('\n')

// ---------------- A：控制台迟到 1 秒 ----------------
console.log('A 控制台迟到（1 秒后 provide）')
await send('Page.navigate', { url: origin })
await wait(500)
await evaluate(HARNESS)
let loaded = await evaluate(bundle)
check('bundle 加载', !(loaded && loaded.__exception), loaded && loaded.__exception)
const applied = await evaluate('(function () { try { window.__mod.apply(window.__ctx); return "ok" } catch (e) { return "THREW: " + String(e && e.message || e) } })()')
check('apply 未抛错', applied === 'ok', applied)
const s0 = JSON.parse(await evaluate(STATE))
check('声明了对 uiSkinLoader 的显式等待', Array.isArray(s0.injectDeps) && s0.injectDeps.indexOf('uiSkinLoader') >= 0, JSON.stringify(s0.injectDeps))
check('等待期间没有抢先自立', s0.styleNodes === 0 && s0.mode === null, JSON.stringify({ nodes: s0.styleNodes, mode: s0.mode }))

await wait(1000)
await evaluate('window.__provideConsole()')
await wait(300)
const s1 = JSON.parse(await evaluate(STATE))
if (s1.__err) console.log('  page error: ' + s1.__err)
if (s1.injectError) console.log('  inject error: ' + s1.injectError)
check('控制台出现后立即登记', (s1.registered || []).length === 1 && s1.registered[0] === SKIN_ID, JSON.stringify(s1.registered))
check('未因竞态误判自立', s1.mode === 'console', String(s1.mode))

await wait(2600) // 越过 3 秒宽限窗口
const s2 = JSON.parse(await evaluate(STATE))
check('宽限窗口过后仍是托管模式（没被自立抢走）', s2.mode === 'console', String(s2.mode))
check('托管模式下由控制台决定是否生效（未激活即不应用）', s2.styleNodes === 0, s2.styleNodes)

// ---------------- B：控制台始终不出现 ----------------
console.log('B 控制台始终不出现（宽限 3 秒后自立）')
await send('Page.navigate', { url: origin })
await wait(500)
await evaluate(HARNESS)
loaded = await evaluate(bundle)
check('bundle 加载', !(loaded && loaded.__exception), loaded && loaded.__exception)
await evaluate('(function () { try { window.__mod.apply(window.__ctx); return "ok" } catch (e) { return "THREW: " + String(e && e.message || e) } })()')
const b0 = JSON.parse(await evaluate(STATE))
check('宽限期内先不动作', b0.styleNodes === 0, b0.styleNodes)
await wait(3400)
const b1 = JSON.parse(await evaluate(STATE))
check('超时后进入自立协调器（装不到加载器时的轻量替代）', b1.mode === 'coordinated', String(b1.mode))
check('自立模式自动应用外观', b1.styleNodes === 1 && b1.attr === '', JSON.stringify({ nodes: b1.styleNodes, attr: b1.attr }))
check('自立模式面板常驻（可切回原生）', b1.hasSection === true, String(b1.hasSection))

const sel = JSON.parse(await evaluate(SELECT_INFO))
check('自立模式选择器已渲染', sel.count === 1, JSON.stringify(sel))
check('当前值 = 本皮肤', sel.value === SKIN_ID, String(sel.value))

const restored = await evaluate('(function () { try { window.__sel.onChange({ target: { value: "default" } }); return "ok" } catch (e) { return "THREW: " + String(e && e.message || e) } })()')
await wait(400)
const b2 = JSON.parse(await evaluate(STATE))
check('选「原生」未抛错', restored === 'ok', restored)
check('选「原生」后立即还原默认皮肤', b2.styleNodes === 0 && b2.attr === null, JSON.stringify({ nodes: b2.styleNodes, attr: b2.attr }))
check('并记住选择（协调器持久化为 default，重启仍原生）', b2.standaloneStored === 'default', String(b2.standaloneStored))

console.log(failures === 0 ? '\n全部通过' : '\n' + failures + ' 项失败')
await send('Target.closeTarget', { targetId: target.id }).catch(() => {})
server.close()
process.exit(failures === 0 ? 0 : 1)
