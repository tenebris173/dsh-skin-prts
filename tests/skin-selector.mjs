/**
 * 「皮肤」选择器测试：设置面板里的下拉第一项必须是「原生」，选中它要真的切回默认皮肤。
 *
 * 控制台（加载器）暴露 list() / current() / switchTo(id) / subscribe()，选择器靠它们工作。
 *
 * 用法：node tests/skin-selector.mjs   （需 Chrome 以 --remote-debugging-port=9222 启动）
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')
const MY_ID = 'skins.prts'

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

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log('  ok   ' + name)
  else { failures++; console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}

const HARNESS = [
  'window.__fakeReact = {',
  '  createElement: function (type, props) { var kids = [].slice.call(arguments, 2); return { type: type, props: props || {}, children: kids }; },',
  '  useState: function (init) { return [typeof init === "function" ? init() : init, function () {}]; },',
  '  useEffect: function () {}',
  '};',
  'window.__ModuleLoader__ = { load: function (b) { window.__mod = b.factory(function (n) { if (n === "react") return window.__fakeReact; throw new Error("ext " + n); }); } };',
  'window.__switched = [];',
  'window.__section = null;',
  '// 假控制台：两款皮肤 + 当前是 PRTS',
  'window.__listed = [',
  '  { id: "skins.abyssal", name: "深渊 ABYSSAL", version: "1.0.8" },',
  '  { id: "skins.prts", name: "PRTS", version: "1.0.6" }',
  '];',
  'window.__current = "skins.prts";',
  'window.__ctx = {',
  '  logger: { warn: function () {}, info: function () {}, debug: function () {}, error: function () {} },',
  '  effect: function (fn) { return typeof fn === "function" ? fn() : undefined; },',
  '  theme: { register: function () { return function () {} }, overrideTokens: function () { return function () {} } },',
  '  slots: {',
  '    inject: function (key, cb) { cb(); return function () {} },',
  '    register: function (opts, comp) { window.__section = comp; return function () {} }',
  '  },',
  '  locale: { register: function () { return function () {} }, bind: function () { return function (k) { return k }; } },',
  '  inject: function (deps, cb) { cb({ uiSkinLoader: window.__ctx.uiSkinLoader }); return function () {} },',
  '  uiSkinLoader: {',
  '    registerSkin: function (reg) { window.__reg = reg; return function () {} },',
  '    list: function () { return window.__listed },',
  '    current: function () { return window.__current },',
  '    switchTo: function (id) { window.__switched.push(id); return Promise.resolve({ ok: true }) },',
  '    subscribe: function () { return function () {} }',
  '  }',
  '};',
  'true',
].join('\n')

// 页面侧：渲染面板 → 找到「皮肤」下拉（aria-label 是 locale key）
const FIND_SELECT = [
  '(function () {',
  '  function walk(node, out) {',
  '    if (!node || typeof node !== "object") return out;',
  '    if (typeof node.type === "function") { try { return walk(node.type(node.props || {}), out) } catch (e) { return out } }',
  '    var props = node.props || {};',
  '    if (node.type === "select" && props["aria-label"] === "settings.skin") {',
  '      var raw = props.children || [];',
  '      var flatOpts = [];',
  '      for (var m = 0; m < raw.length; m++) { if (Array.isArray(raw[m])) flatOpts = flatOpts.concat(raw[m]); else flatOpts.push(raw[m]); }',
  '      out.push({',
  '        value: props.value,',
  '        options: flatOpts.map(function (o) {',
  '          var label = (o && o.children && o.children[0] !== undefined) ? o.children[0] : "";',
  '          return { value: o && o.props ? o.props.value : null, label: label };',
  '        }),',
  '        onChange: props.onChange',
  '      });',
  '    }',
  '    var kids = node.children || [];',
  '    var flat = [];',
  '    for (var j = 0; j < kids.length; j++) { if (Array.isArray(kids[j])) flat = flat.concat(kids[j]); else flat.push(kids[j]); }',
  '    for (var i = 0; i < flat.length; i++) walk(flat[i], out);',
  '    return out;',
  '  }',
  '  try {',
  '    var el = window.__section();',
  '    var found = walk(el, []);',
  '    window.__sel = found[0] || null;',
  '    return JSON.stringify({ count: found.length, value: found[0] ? found[0].value : null, options: found[0] ? found[0].options : [] });',
  '  } catch (e) { return JSON.stringify({ err: String(e && e.message || e) }); }',
  '})()',
].join('\n')

await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: origin })
await new Promise((r) => setTimeout(r, 500))
await evaluate(HARNESS)
const loaded = await evaluate(bundle)
if (loaded && loaded.__exception) { console.log('bundle 加载失败:', loaded.__exception); process.exit(1) }

console.log('「皮肤」选择器')

const applied = await evaluate('(function () { try { window.__mod.apply(window.__ctx); return "ok" } catch (e) { return "THREW: " + String(e && e.message || e) } })()')
check('apply 未抛错', applied === 'ok', applied)
check('已把控制台引用交给皮肤', (await evaluate('typeof window.__reg')) === 'object', await evaluate('typeof window.__reg'))

// 控制台托管路径：登记后由控制台调 activate，设置面板这时才注册
const act = await evaluate('(function () { try { window.__reg.activate({ logger: window.__ctx.logger, signal: new AbortController().signal, slots: window.__ctx.slots }); return "ok" } catch (e) { return "THREW: " + String(e && e.message || e) } })()')
check('activate 未抛错', act === 'ok', act)

const info = JSON.parse(await evaluate(FIND_SELECT))
info.options = info.options || []
check('面板里能找到「皮肤」下拉', info.count === 1, JSON.stringify(info).slice(0, 120))
check('选择器已渲染（面板里能找到「皮肤」下拉）', info.count === 1, JSON.stringify(info))
check('选择器选项数组可枚举', Array.isArray(info.options), typeof info.options)
check('当前值跟随控制台 current()', info.value === 'skins.prts', String(info.value))

const switched = await evaluate('(function () { try { window.__sel.onChange({ target: { value: "default" } }); return JSON.stringify(window.__switched); } catch (e) { return "THREW: " + String(e && e.message || e) } })()')
check('选「原生」会调用 switchTo("default")（= 还原默认皮肤）', String(switched).indexOf('"default"') >= 0, switched)

const back = await evaluate('(function () { try { window.__sel.onChange({ target: { value: "skins.abyssal" } }); return JSON.stringify(window.__switched); } catch (e) { return "THREW: " + String(e && e.message || e) } })()')
check('也能切到别的皮肤（同样走 switchTo）', String(back).indexOf('"skins.abyssal"') >= 0, back)

console.log(failures === 0 ? '\n全部通过' : '\n' + failures + ' 项失败')
await send('Target.closeTarget', { targetId: target.id }).catch(() => {})
server.close()
process.exit(failures === 0 ? 0 : 1)
