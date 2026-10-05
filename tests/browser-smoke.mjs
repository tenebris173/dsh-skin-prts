/**
 * PRTS 皮肤集成冒烟测试 —— 真实浏览器引擎里跑真实 bundle。
 *
 * 覆盖：登记载荷 → activate 副作用（主题/覆盖层/样式表/装饰层/席位）→
 *       纸面与终端两套底的真实 CSS 层叠 → 跟随应用主题切换 → 纹理开关 → teardown 净场。
 *
 * 前置：Chrome 以 --remote-debugging-port=9222 启动。
 * 用法：node tests/browser-smoke.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end('<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>prts-test</title></head><body></body></html>')
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}/`

const target = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
})
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (res.result?.exceptionDetails) return { __exception: res.result.exceptionDetails.exception?.description ?? 'exception' }
  return res.result?.result?.value
}

await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: origin })
await new Promise((r) => setTimeout(r, 500))

const HARNESS = String.raw`
window.__calls = { effects: [], themeRegisters: [], overrides: 0, slots: [], locale: null, registered: null,
  themeDisposed: 0, unregistered: false };
window.__fakeReact = {
  createElement: function (type, props) { return { type: type, props: props || {} }; },
  useState: function (init) { return [typeof init === 'function' ? init() : init, function () {}]; },
  useEffect: function () {},
};
window.__loaded = {};
window.__ModuleLoader__ = {
  load: function (b) {
    var req = function (name) {
      if (name === 'react') return window.__fakeReact;
      throw new Error('unexpected external: ' + name);
    };
    window.__loaded[b.id] = b.factory(req);
  },
};
// 可控的"应用主题偏好"开关
window.__pref = 'dark';
true`

const HARNESS2 = String.raw`
(function () {
  var c = window.__calls;
  var ctx = {
    effect: function (fn, label) { c.effects.push(label); var d = typeof fn === 'function' ? fn() : undefined; return function () { if (typeof d === 'function') d(); }; },
    theme: {
      getTheme: function () { return { preference: window.__pref }; },
      register: function (def) { c.themeRegisters.push({ id: def.id, scheme: def.colorScheme, tokens: Object.keys(def.tokens).length }); return function () { c.themeDisposed++; }; },
      overrideTokens: function (source, table) { c.overrides++; c.lastSource = source; c.lastTokens = Object.keys(table).length; c.lastTable = table; return function () { c.overridesDisposed = true; }; },
    },
    slots: {
      inject: function (key, cb) { c.slots.push(key); cb(); return function () {}; },
      register: function (opts, comp) { c.section = { id: opts.id, order: opts.order, label: typeof opts.label === 'function' ? opts.label() : opts.label }; c.component = comp; return function () {}; },
    },
    locale: { register: function (ns, d) { c.locale = { ns: ns, zh: Object.keys(d.zh).length, en: Object.keys(d.en).length }; return function () {}; }, bind: function () { return function (k) { return k; }; } },
    uiSkinLoader: { registerSkin: function (reg) { c.registered = reg; return function () { c.unregistered = true; }; } },
  };
  var mod = window.__loaded['dsh-skin-prts'];
  mod.apply(ctx);
  var logs = [];
  var skinCtx = { logger: { debug: function () {}, info: function (m) { logs.push(m); }, warn: function (m, d) { logs.push('warn:' + m + JSON.stringify(d || {})); }, error: function () {} }, signal: new AbortController().signal, slots: ctx.slots };
  c.registered.activate(skinCtx);

  function snap(label) {
    var cs = getComputedStyle(document.body);
    var dlg = document.createElement('div');
    dlg.setAttribute('role', 'dialog');
    document.body.appendChild(dlg);
    var dlgBg = getComputedStyle(dlg).backgroundColor;
    var dlgShadow = getComputedStyle(dlg).boxShadow;
    dlg.remove();
    return {
      label: label,
      base: cs.getPropertyValue('--dsw-alias-bg-base').trim(),
      layer2: cs.getPropertyValue('--dsw-alias-bg-layer-2').trim(),
      label1: cs.getPropertyValue('--dsw-alias-label-primary').trim(),
      brand: cs.getPropertyValue('--dsw-alias-brand-primary').trim(),
      radiusMd: cs.getPropertyValue('--dsw-radius-md').trim(),
      radiusPanel: cs.getPropertyValue('--dsw-radius-panel').trim(),
      font: cs.getPropertyValue('--dsw-font-family').trim().slice(0, 24),
      modeAttr: document.documentElement.getAttribute('data-skn-prts-mode'),
      dialogBg: dlgBg, dialogShadow: dlgShadow,
      bodyBg: cs.backgroundColor,
    };
  }

  var out = { inject: mod.inject, registered: { apiVersion: c.registered.apiVersion, id: c.registered.id, name: c.registered.name, version: c.registered.version, preview: typeof c.registered.preview, tags: c.registered.tags } };
  out.afterActivate = {
    bodyAttr: document.body.getAttribute('data-skn-prts'),
    styleNode: !!document.querySelector('style[data-skn-prts-style]'),
    cssLen: (document.querySelector('style[data-skn-prts-style]') || {}).textContent ? document.querySelector('style[data-skn-prts-style]').textContent.length : 0,
    chrome: !!document.querySelector('[data-skn-prts-chrome]'),
    chromeParts: document.querySelectorAll('[data-skn-prts-chrome] > *').length,
    themeRegisters: c.themeRegisters.slice(),
    overrides: c.overrides, tokens: c.lastTokens, source: c.lastSource,
    section: c.section, locale: c.locale, effects: c.effects.length,
    sectionRenderable: !!(c.component && c.component()),
    snapshot: snap('follow→terminal(window.__pref=dark)'),
  };

  // 切到纸面（强制）
  localStorage.setItem('dsh.skin.prts.preferences.v1', JSON.stringify({ appearance: 'paper', radius: 'square', accent: 'yellow', texture: true, lift: true, din: true }));
  window.dispatchEvent(new StorageEvent('storage', { key: 'dsh.skin.prts.preferences.v1' }));
  out.paper = snap('paper');

  // 切到终端 + 换强调色 + 换圆角
  localStorage.setItem('dsh.skin.prts.preferences.v1', JSON.stringify({ appearance: 'terminal', radius: 'bench', accent: 'cyan', texture: true, lift: false, din: false }));
  window.dispatchEvent(new StorageEvent('storage', { key: 'dsh.skin.prts.preferences.v1' }));
  out.terminalCyan = snap('terminal+cyan+bench');
  out.themeRegistersAfter = c.themeRegisters.slice();

  // 关纹理
  localStorage.setItem('dsh.skin.prts.preferences.v1', JSON.stringify({ appearance: 'paper', radius: 'square', accent: 'yellow', texture: false, lift: true, din: true }));
  window.dispatchEvent(new StorageEvent('storage', { key: 'dsh.skin.prts.preferences.v1' }));
  var css = document.querySelector('style[data-skn-prts-style]').textContent;
  out.textureOff = { chrome: !!document.querySelector('[data-skn-prts-chrome]'), hasGrid: css.indexOf('-grid{') >= 0, hasScan: css.indexOf('-scan{') >= 0, hasEdge: css.indexOf('-edge{') >= 0, hasLift: css.indexOf('box-shadow:3px 3px') >= 0 };

  // teardown
  c.registered.deactivate();
  var cs3 = getComputedStyle(document.body);
  out.afterTeardown = {
    bodyAttr: document.body.getAttribute('data-skn-prts'),
    styleNode: !!document.querySelector('style[data-skn-prts-style]'),
    chrome: !!document.querySelector('[data-skn-prts-chrome]'),
    modeAttr: document.documentElement.getAttribute('data-skn-prts-mode'),
    themeDisposed: c.themeDisposed,
    radiusMd: cs3.getPropertyValue('--dsw-radius-md').trim(),
    brand: cs3.getPropertyValue('--dsw-alias-brand-primary').trim(),
    logs: logs,
  };
  return JSON.stringify(out);
})()`

await evaluate(HARNESS)
const loadResult = await evaluate(bundle)
if (loadResult && loadResult.__exception) { console.log('bundle 加载异常:', loadResult.__exception); process.exit(1) }
const raw = await evaluate(HARNESS2)
if (typeof raw !== 'string') { console.log('测试执行失败:', JSON.stringify(raw)); process.exit(1) }
const r = JSON.parse(raw)

let failures = 0
const tight = (v) => String(v).replace(/\s+/g, '')
const check = (name, cond, extra = '') => {
  if (cond) console.log('  ok   ' + name)
  else { failures++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')) }
}

console.log('皮肤登记')
check('导出 inject 服务清单', Array.isArray(r.inject) && r.inject.length === 4, JSON.stringify(r.inject))
check('apiVersion / id / name 正确', r.registered.apiVersion === 'dsh.ecosystem.ui-skin-loader/v1' && r.registered.id === 'skins.prts' && r.registered.name === 'PRTS')
check('带内联 SVG 预览', r.registered.preview === 'string')

console.log('激活副作用')
check('body 打上皮肤标记', r.afterActivate.bodyAttr === '')
check('注入自有 style 节点', r.afterActivate.styleNode && r.afterActivate.cssLen > 5000, 'len=' + r.afterActivate.cssLen)
check('注入装饰层（网格/扫描线/边缘/四角 = 7 个节点）', r.afterActivate.chrome && r.afterActivate.chromeParts === 7, 'parts=' + r.afterActivate.chromeParts)
check('token 覆盖 100+ 项', r.afterActivate.overrides === 1 && r.afterActivate.tokens > 100, 'tokens=' + r.afterActivate.tokens)
check('覆盖层 source = 皮肤 id', r.afterActivate.source === 'skins.prts')
check('注册 settings.section 席位', r.afterActivate.section?.id === 'skn-prts-settings')
check('中英文字典齐备', r.afterActivate.locale?.zh > 10 && r.afterActivate.locale?.en > 10)
check('设置面板可渲染', r.afterActivate.sectionRenderable === true)

console.log('跟随应用主题（偏好=dark → 终端底）')
const follow = r.afterActivate.snapshot
check('解析为终端底', follow.modeAttr === 'terminal' && tight(follow.base) === '#0d1012', follow.modeAttr + '/' + follow.base)
check('主题按 dark 注册', r.afterActivate.themeRegisters[0]?.scheme === 'dark', JSON.stringify(r.afterActivate.themeRegisters[0]))
check('圆角为直角（0px）', follow.radiusMd === '0px', follow.radiusMd)
check('表面实心（弹窗不会透字）', tight(follow.layer2) === '#171c1f', follow.layer2)

console.log('纸面（亮）')
check('底色切到纸白', r.paper.modeAttr === 'paper' && tight(r.paper.base) === '#f4f5f7', r.paper.base)
check('文字切到近黑', tight(r.paper.label1) === '#111417', r.paper.label1)
check('弹窗面板实心白', tight(r.paper.dialogBg) === 'rgb(255,255,255)' || tight(r.paper.dialogBg) === '#ffffff', r.paper.dialogBg)
check('弹窗带硬投影', r.paper.dialogShadow.includes('3px 3px'), r.paper.dialogShadow.slice(0, 40))
check('主题重注册为 light', r.themeRegistersAfter.some((x) => x.scheme === 'light'), JSON.stringify(r.themeRegistersAfter.map((x) => x.scheme)))

console.log('终端 + 信号青 + 工作台圆角')
check('底色切到近黑', tight(r.terminalCyan.base) === '#0d1012', r.terminalCyan.base)
check('强调色切到信号青', tight(r.terminalCyan.brand) === '#2ecfd0', r.terminalCyan.brand)
check('圆角切到工作台（6/8px）', r.terminalCyan.radiusMd === '6px' && r.terminalCyan.radiusPanel === '12px', r.terminalCyan.radiusMd + '/' + r.terminalCyan.radiusPanel)

console.log('纹路与投影开关')
check('关纹理后不再输出网格/扫描线', r.textureOff.hasGrid === false && r.textureOff.hasScan === false, JSON.stringify(r.textureOff))
check('装饰层仍在（四角/边缘保留）', r.textureOff.chrome === true && r.textureOff.hasEdge === true)
check('硬投影仍开启', r.textureOff.hasLift === true)

console.log('teardown 净场')
check('body 标记摘除', r.afterTeardown.bodyAttr === null)
check('style 节点移除', r.afterTeardown.styleNode === false)
check('装饰层整体移除', r.afterTeardown.chrome === false)
check('mode 属性移除', r.afterTeardown.modeAttr === null)
check('主题注册被 dispose', r.afterTeardown.themeDisposed >= 2, 'disposed=' + r.afterTeardown.themeDisposed)
check('token 无残留', r.afterTeardown.radiusMd === '' && r.afterTeardown.brand === '', r.afterTeardown.radiusMd + '/' + r.afterTeardown.brand)

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
await send('Target.closeTarget', { targetId: target.id }).catch(() => {})
server.close()
process.exit(failures === 0 ? 0 : 1)
