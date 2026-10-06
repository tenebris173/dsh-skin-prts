/**
 * 自立模式测试：**没有皮肤控制台**时，皮肤必须自己生效、可开关、可调节。
 *
 * 覆盖：
 *   1 无 uiSkinLoader → 自动应用外观（样式节点 / body 标记 / token 覆盖）
 *   2 暴露统一接口 window.__dshSkins[skinId]（mode=standalone、isActive、get/setSettings）
 *   3 关掉开关（enabled=false）→ 立即卸下并复位 token
 *   4 再打开 → 恢复
 *   5 被别的自立皮肤占用 → 不抢（isActive=false）
 *   6 卸载（fiber dispose）→ 全部清理
 *
 * 用法：node tests/standalone.mjs   （需 Chrome 以 --remote-debugging-port=9222 启动）
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end('<!doctype html><html lang="zh"><head><meta charset="utf-8"></head><body></body></html>')
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}/`

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
await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: origin })
await new Promise((r) => setTimeout(r, 400))

const HARNESS = String.raw`
window.__fakeReact = { createElement: function (t, p) { return { type: t, props: p || {} }; },
  useState: function (i) { return [typeof i === 'function' ? i() : i, function () {}]; }, useEffect: function () {} };
window.__ModuleLoader__ = { load: function (b) { window.__mod = b.factory(function (n) { if (n === 'react') return window.__fakeReact; throw new Error('ext ' + n); }); } };
window.__calls = { warns: [] };
// 关键：**不提供 uiSkinLoader** —— 模拟"没装控制台"
window.__ctx = {
  effect: function (fn) { var d = typeof fn === 'function' ? fn() : undefined; window.__dispose = d; return d; },
  logger: { warn: function (m) { window.__calls.warns.push(String(m)) }, info: function () {}, debug: function () {}, error: function () {} },
  theme: {
    register: function (def) { return function () {}; },
    overrideTokens: function (source, table) { window.__override = { source: source, count: Object.keys(table).length }; return function () {}; },
  },
  slots: { inject: function (k, cb) { cb(); return function () {}; }, register: function () { return function () {}; } },
  locale: { register: function () { return function () {}; }, bind: function () { return function (k) { return k; }; } },
};
true`
await evaluate(HARNESS)
const loaded = await evaluate(bundle)
if (loaded && loaded.__exception) { console.log('bundle 加载失败:', loaded.__exception); process.exit(1) }

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log('  ok   ' + name)
  else { failures++; console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const state = () => evaluate(`(function(){
  var cs = getComputedStyle(document.body);
  var api = (window.__dshSkins || {})["skins.prts"];
  return JSON.stringify({
    styleNodes: document.querySelectorAll("style[data-skn-prts-style]").length,
    skinAttr: document.body.getAttribute("data-skn-prts"),
    base: cs.getPropertyValue('--dsw-alias-bg-base').trim(),
    radiusMd: cs.getPropertyValue('--dsw-radius-md').trim(),
    apiMode: api ? api.mode : null,
    apiActive: api ? api.isActive() : null,
    override: window.__override || null,
    warns: (window.__calls && window.__calls.warns.length) || 0
  }); })()`)

console.log('自立模式（无控制台）')

// 1) 应用 → 应自动生效
await evaluate(`(function(){ window.__mod.apply(window.__ctx); return 1 })()`)
await new Promise((r) => setTimeout(r, 500))
const s1 = JSON.parse(await state())
check('自动应用外观（样式节点唯一）', s1.styleNodes === 1, s1.styleNodes)
check('body 标记已打上', s1.skinAttr === '', s1.skinAttr)
check('token 覆盖 ≥100 项', s1.override && s1.override.count >= 100, s1.override && s1.override.count)
check('覆盖层 source = 皮肤 id', s1.override && s1.override.source === "skins.prts", s1.override && s1.override.source)

// 2) 公开接口
check('暴露 window.__dshSkins[skinId]', s1.apiMode === 'standalone', s1.apiMode)
check('接口报告 isActive = true', s1.apiActive === true, s1.apiActive)
const api = await evaluate(`(function(){ var a = window.__dshSkins["skins.prts"]; return JSON.stringify({ keys: Object.keys(a), version: a.version }) })()`)
const apiInfo = JSON.parse(api)
check('接口含 activate/deactivate/isActive/getSettings/setSettings',
  ['activate', 'deactivate', 'isActive', 'getSettings', 'setSettings'].every((k) => apiInfo.keys.includes(k)), apiInfo.keys.join(','))

// 3) 关掉开关 → 应立即卸下
await evaluate(`(function(){ var a = window.__dshSkins["skins.prts"]; a.setSettings({ enabled: false }); return 1 })()`)
await new Promise((r) => setTimeout(r, 500))
const s2 = JSON.parse(await state())
check('关掉开关后样式节点归零', s2.styleNodes === 0, s2.styleNodes)
check('关掉开关后标记摘除', s2.skinAttr === null, s2.skinAttr)
check('关掉开关后 isActive = false', s2.apiActive === false, s2.apiActive)

// 4) 再打开 → 恢复
await evaluate(`(function(){ var a = window.__dshSkins["skins.prts"]; a.setSettings({ enabled: true }); return 1 })()`)
await new Promise((r) => setTimeout(r, 500))
const s3 = JSON.parse(await state())
check('重新打开后恢复', s3.styleNodes === 1 && s3.apiActive === true, JSON.stringify({ nodes: s3.styleNodes, active: s3.apiActive }))

// 5) 被别的自立皮肤占用 → 不抢
await evaluate(`(function(){ localStorage.setItem('dsh.skin.standalone.owner.v1', 'someone.else.skin'); window.dispatchEvent(new StorageEvent('storage', { key: 'dsh.skin.standalone.owner.v1' })); return 1 })()`)
await new Promise((r) => setTimeout(r, 500))
const s4 = JSON.parse(await state())
check('被占用时让位（样式节点归零）', s4.styleNodes === 0, s4.styleNodes)
check('被占用时 isActive = false', s4.apiActive === false, s4.apiActive)

// 6) 卸载 → 全清
await evaluate(`(function(){ if (typeof window.__dispose === 'function') window.__dispose(); return 1 })()`)
await new Promise((r) => setTimeout(r, 400))
const s5 = JSON.parse(await state())
check('卸载后样式节点归零', s5.styleNodes === 0, s5.styleNodes)
check('卸载后接口已摘除', s5.apiMode === null, s5.apiMode)

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
await send('Target.closeTarget', { targetId: target.id }).catch(() => {})
server.close()
process.exit(failures === 0 ? 0 : 1)
