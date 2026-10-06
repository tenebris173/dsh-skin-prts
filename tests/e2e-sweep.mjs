/**
 * PRTS —— 端到端扫测（把 bundle 注入真实 DSH 页面实跑一轮）
 *
 * 与 tests/browser-smoke.mjs 的分工：
 *   browser-smoke  自建页面 + 假 ctx，逐项断言 bundle 行为（不需要 DSH）
 *   e2e-sweep      注入**正在运行的 DSH 页面**，跑真实交互并采集控制台异常（本文件）
 *
 * 用法：
 *   dsh web --no-open --port 0                                  # 起一个 DSH 页面，记下 URL
 *   chrome --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/cdp about:blank
 *   node tests/e2e-sweep.mjs <url> [outDir]
 *
 * 覆盖：激活副作用（含装饰层）/ 两套底与逐档切换 / 跟随系统亮色 / 连切压力 /
 *       真实设置弹窗 / deactivate 净场 / 二次激活 / 全程异常采集。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const [, , url, outDirArg] = process.argv
if (!url) {
  console.error('usage: node tests/e2e-sweep.mjs <url> [outDir]')
  process.exit(2)
}
const outDir = outDirArg || 'e2e-out'
mkdirSync(outDir, { recursive: true })
const bundle = readFileSync(path.join(process.cwd(), 'lib', 'client.js'), 'utf8')

const CFG = {
  moduleId: 'dsh-skin-prts',
  storageKey: 'dsh.skin.prts.preferences.v1',
  attr: 'data-skn-prts',
  styleSel: 'style[data-skn-prts-style]',
  chromeSel: '[data-skn-prts-chrome]',
  methodName: 'skins.prts',
  cases: [
    { name: '纸面+警示黄+直角', v: { appearance: 'paper', accent: 'yellow', radius: 'square', texture: true, lift: true, din: true }, expect: { base: '#f4f5f7', radiusMd: '0px' } },
    { name: '终端+信号青+工作台', v: { appearance: 'terminal', accent: 'cyan', radius: 'bench', texture: true, lift: true, din: true }, expect: { base: '#0d1012', radiusMd: '6px' } },
    { name: '纸面+工程橙+圆润', v: { appearance: 'paper', accent: 'orange', radius: 'round', texture: false, lift: false, din: false }, expect: { base: '#f4f5f7', radiusMd: '12px' } },
  ],
}

const target = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const exceptions = []
const consoleErrors = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
  if (m.method === 'Runtime.exceptionThrown') exceptions.push(String(m.params?.exceptionDetails?.exception?.description || '').split('\n')[0])
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params?.type)) {
    consoleErrors.push(m.params.type + ': ' + (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 160))
  }
})
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (res.result?.exceptionDetails) return { __exception: String(res.result.exceptionDetails.exception?.description || '').split('\n')[0] }
  return res.result?.result?.value
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (name) => {
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(path.join(outDir, name), Buffer.from(res.result.data, 'base64'))
}
const clickText = (text) => evaluate(`(function(){var b=[].slice.call(document.querySelectorAll('button,div,span')).filter(function(x){return (x.textContent||'').trim()===${JSON.stringify(text)}});if(b.length){b[b.length-1].click();return 'clicked'}return 'none'})()`)

const problems = []
const results = []
const step = (name, ok, detail) => {
  results.push({ name, ok, detail: detail === undefined ? '' : String(detail).slice(0, 200) })
  if (!ok) problems.push(name + ' :: ' + (detail === undefined ? '' : String(detail).slice(0, 200)))
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail !== undefined ? '  (' + String(detail).slice(0, 90) + ')' : ''}`)
}
const snap = () => evaluate(`(function(){var c=getComputedStyle(document.body);return JSON.stringify({
  base:c.getPropertyValue('--dsw-alias-bg-base').trim(), label:c.getPropertyValue('--dsw-alias-label-primary').trim(),
  radiusMd:c.getPropertyValue('--dsw-radius-md').trim(), brand:c.getPropertyValue('--dsw-alias-brand-primary').trim(),
  darkAttr:document.body.hasAttribute('data-ds-dark-theme'),
  styleNodes:document.querySelectorAll(${JSON.stringify(CFG.styleSel)}).length,
  chromeNodes:document.querySelectorAll(${JSON.stringify(CFG.chromeSel)} + ' > *').length,
  skinAttr:document.body.getAttribute(${JSON.stringify(CFG.attr)}) })})()`)

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
await wait(11000)
for (const t of ['继续', '我知道了']) await clickText(t)
await wait(1000)

const baseline = JSON.parse(await snap())
console.log('  基线:', JSON.stringify(baseline))
await shot('01-baseline.png')

await evaluate(String.raw`
window.__sk = { effects: 0, themeIds: [], registrations: [], live: {} };
window.__fakeReact = { createElement: function (t, p) { return { type: t, props: p || {} }; },
  useState: function (i) { return [typeof i === 'function' ? i() : i, function () {}]; }, useEffect: function () {} };
window.__ModuleLoader__ = { load: function (b) { window.__skMod = b.factory(function (n) { if (n === 'react') return window.__fakeReact; throw new Error('external ' + n); }); } };
window.__skCtx = {
  effect: function (fn) { window.__sk.effects++; var d = typeof fn === 'function' ? fn() : undefined; return function () { if (typeof d === 'function') d(); }; },
  theme: {
    getTheme: function () { return { preference: '' }; },
    register: function (def) { if (window.__sk.live[def.id]) throw new Error('theme "' + def.id + '" is already registered');
      window.__sk.live[def.id] = true; window.__sk.themeIds.push(def.id);
      window.__sk.registrations.push({ id: def.id, scheme: def.colorScheme, tokens: Object.keys(def.tokens || {}).length });
      return function () { delete window.__sk.live[def.id]; }; },
    overrideTokens: function (s, t) { window.__sk.overrideSource = s; window.__sk.overrideCount = Object.keys(t).length; return function () {}; },
  },
  slots: { inject: function (k, cb) { cb(); return function () {}; }, register: function () { return function () {}; } },
  locale: { register: function () { return function () {}; }, bind: function () { return function (k) { return k; }; } },
  uiSkinLoader: { registerSkin: function (reg) { window.__skReg = reg; return function () {}; } },
};
true`)
const loadErr = await evaluate(bundle)
step('bundle 加载无异常', !(loadErr && loadErr.__exception), loadErr?.__exception)

const act = await evaluate(`(function(){ try {
  window.__skMod.apply(window.__skCtx);
  window.__skReg.activate({ logger:{debug:function(){},info:function(){},warn:function(){},error:function(){}}, signal:new AbortController().signal, slots:window.__skCtx.slots });
  return JSON.stringify({ id: window.__skReg.id, version: window.__skReg.version, tags: window.__skReg.tags, preview: typeof window.__skReg.preview });
} catch (e) { return 'THREW: ' + String(e && e.message || e); } })()`)
step('activate 成功', typeof act === 'string' && act.startsWith('{'), act)
await wait(1200)

const after = JSON.parse(await snap())
step('标记 / 唯一样式节点', after.skinAttr === '' && after.styleNodes === 1, JSON.stringify({ attr: after.skinAttr, nodes: after.styleNodes }))
step('装饰层 7 节点（网格/扫描线/警示条/四角）', after.chromeNodes === 7, after.chromeNodes)
step('token 覆盖 ≥100 项', (await evaluate('window.__sk.overrideCount')) >= 100, await evaluate('window.__sk.overrideCount'))
step('主题注册 token > 100', (await evaluate('window.__sk.registrations[0].tokens')) > 100, JSON.stringify(await evaluate('window.__sk.registrations[0]')))
await shot('02-activate.png')

for (const [i, c] of CFG.cases.entries()) {
  await evaluate(`(function(){localStorage.setItem(${JSON.stringify(CFG.storageKey)}, ${JSON.stringify(JSON.stringify(c.v))});window.dispatchEvent(new StorageEvent('storage',{key:${JSON.stringify(CFG.storageKey)}}));return 1})()`)
  await wait(600)
  const t = JSON.parse(await snap())
  const bad = Object.entries(c.expect).filter(([k, v]) => String(t[k]).toLowerCase() !== String(v).toLowerCase())
  step(`切换 ${i + 1}：${c.name}`, bad.length === 0, bad.length ? JSON.stringify(bad.map(([k, v]) => k + ' 期望' + v + ' 实为' + t[k])) : '')
  if (i < 2) await shot(`03-case${i + 1}.png`)
}

// 跟随系统：模拟 light 应落到纸面底
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
await evaluate(`(function(){localStorage.setItem(${JSON.stringify(CFG.storageKey)}, JSON.stringify({appearance:'follow'}));window.dispatchEvent(new StorageEvent('storage',{key:${JSON.stringify(CFG.storageKey)}}));return 1})()`)
await wait(2200)
const light = JSON.parse(await snap())
step('跟随系统 light → 纸面底 #f4f5f7', String(light.base).toLowerCase() === '#f4f5f7' && light.darkAttr === false, JSON.stringify({ base: light.base, darkAttr: light.darkAttr }))
await shot('04-follow-light.png')
await send('Emulation.setEmulatedMedia', { features: [] })
await wait(1600)

for (let i = 0; i < 10; i++) {
  const c = CFG.cases[i % CFG.cases.length]
  await evaluate(`(function(){localStorage.setItem(${JSON.stringify(CFG.storageKey)}, ${JSON.stringify(JSON.stringify(c.v))});window.dispatchEvent(new StorageEvent('storage',{key:${JSON.stringify(CFG.storageKey)}}));return 1})()`)
  await wait(120)
}
await wait(700)
const stress = JSON.parse(await snap())
step('连切 10 次后样式节点仍唯一', stress.styleNodes === 1, stress.styleNodes)
step('连切 10 次后装饰层仍在', stress.chromeNodes === 7, stress.chromeNodes)

await clickText('设置'); await wait(2200)
const dlg = await evaluate(`(function(){var d=document.querySelector('[role=dialog]');if(!d)return 'no-dialog';var c=getComputedStyle(d);return JSON.stringify({bg:c.backgroundColor,blur:c.backdropFilter||c.webkitBackdropFilter||'none'})})()`)
let dlgOk = false
try {
  const d = JSON.parse(dlg)
  const m = /rgba?\(([^)]+)\)/.exec(d.bg)
  const parts = m ? m[1].split(',').map(Number) : []
  dlgOk = (parts.length > 3 ? parts[3] : 1) >= 0.9
} catch (e) { /* 页面没有弹窗就跳过 */ }
step('设置弹窗背景实心（alpha ≥ 0.9）', dlgOk, dlg)
if (typeof dlg === 'string' && dlg.startsWith('{')) await shot('05-dialog.png')
await evaluate(`(function(){var b=document.querySelector('[aria-label*=关闭],[class*=close]');if(b)b.click();return 1})()`)
await wait(800)

const deact = JSON.parse(await evaluate(`(function(){ window.__skReg.deactivate(); return JSON.stringify({
  attr: document.body.getAttribute(${JSON.stringify(CFG.attr)}), styleNodes: document.querySelectorAll(${JSON.stringify(CFG.styleSel)}).length,
  chrome: document.querySelectorAll(${JSON.stringify(CFG.chromeSel)}).length,
  base: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim(),
  radiusMd: getComputedStyle(document.body).getPropertyValue('--dsw-radius-md').trim(),
  liveThemes: Object.keys(window.__sk.live).length }); })()`))
step('deactivate 净场（标记/样式/装饰层/主题）', deact.attr === null && deact.styleNodes === 0 && deact.chrome === 0 && deact.liveThemes === 0, JSON.stringify(deact))
step('token 回到基线', deact.base === baseline.base && deact.radiusMd === baseline.radiusMd, JSON.stringify({ base: deact.base, was: baseline.base }))

const retry = JSON.parse(await evaluate(`(function(){ try { window.__skMod.apply(window.__skCtx);
  window.__skReg.activate({ logger:{debug:function(){},info:function(){},warn:function(){},error:function(){}}, signal:new AbortController().signal, slots:window.__skCtx.slots });
  return JSON.stringify({ ok: true, ids: window.__sk.themeIds }); } catch (e) { return JSON.stringify({ ok: false, err: String(e && e.message || e) }); } })()`))
step('二次激活（皮肤重载场景）不抛错', retry.ok === true, retry.err || '')
step('改档注册无堆积（无带序号兜底 id）', Array.isArray(retry.ids) && !retry.ids.some((id) => /-\d+$/.test(id)), (retry.ids || []).length + ' 次注册')
await wait(800)
await shot('06-reactivate.png')

const realErrors = exceptions.filter((x) => x && !/favicon|net::ERR_/.test(x))
step('全程无未捕获异常', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))
const realWarns = consoleErrors.filter((x) => !/favicon|Failed to load resource|Download the React|Session restoration failed|agent-preset/.test(x))
step('全程无 console.error/warning', realWarns.length === 0, realWarns.slice(0, 2).join(' | '))

writeFileSync(path.join(outDir, 'e2e-report.json'), JSON.stringify({ url: url.replace(/token=[^&]+/, 'token=***'), results, problems, exceptions, consoleErrors }, null, 2))
console.log(`\n=== ${results.filter((r) => r.ok).length}/${results.length} 通过 ===`)
console.log(problems.length ? '问题：\n  ' + problems.join('\n  ') : '无问题')
console.log('（截图与报告在 ' + outDir + '/，其中截图可能含本机会话信息，勿外传）')

await send('Target.closeTarget', { targetId: target.id }).catch(() => {})
process.exit(problems.length ? 1 : 0)
