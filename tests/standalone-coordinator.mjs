/**
 * 自立协调器回归测试 —— 没有皮肤加载器时，多款皮肤应当"单例激活 / 可切换 / 可回原生"。
 *
 * 背景：装不到 @dsh-eac/ui-skin-loader 时，皮肤会走 standalone 兜底；如果各自为政，
 * 就会所有面板都在、所有观感叠加（"各干个的"）。协调器（window.__dshSkinStandaloneV1）
 * 提供与控制台同形的 5 个方法，保证同一时刻只激活一款，并提供「原生（默认观感）」。
 *
 * 对端（peer）：
 *   - real      ：同级目录/显式指定的另一款真实皮肤（本机有，验证真实组合）
 *   - simulated ：内建对端（CI 走这条，不依赖别的仓库）—— 等协调器出现后登记自己
 *   默认 auto：找得到真实对端就用真实的，否则用内建的。
 *
 * 覆盖：
 *   1) 无加载器 → 协调器建立，两款都登记，恰好一款生效
 *   2) 选另一款 → 切换过去，前一款停用（互斥）
 *   3) 选「原生」→ 都不生效，且持久化记录为 default
 *   4) 持久化 → 新页面按上次的选择恢复
 *   5) 有加载器 → 协调器绝不创建，走控制台注册路径
 *
 * 前置：Chrome 以 --remote-debugging-port=9222 启动（与 browser-smoke.mjs 相同）。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const selfBundle = readFileSync(process.env.SKIN_BUNDLE ?? path.join(here, '..', 'lib', 'client.js'), 'utf8')
const SELF_ID = process.env.SELF_SKIN_ID ?? 'skins.prts'

const defaultPeer = path.join(here, '..', '..', process.env.PEER_REPO ?? 'dsh-abyssal-eac', 'lib', 'client.js')
const PEER_MODE = process.env.PEER ?? 'auto'
const SIM_PEER_ID = 'simulated.peer'

// 内建对端：像真皮肤一样是个 bundle，apply 后等协调器出现再登记；activate/deactivate 只切一个 body 标记
const SIMULATED_PEER = `
window.__ModuleLoader__.load({
  id: "simulated-conflicting-skin",
  factory: function () {
    var module = { exports: {} };
    var exports = module.exports;
    var active = false;
    function paint(on) {
      active = on;
      if (on) document.body.setAttribute("data-sim-peer", "");
      else document.body.removeAttribute("data-sim-peer");
    }
    var payload = {
      id: "${SIM_PEER_ID}", name: "SIM PEER", version: "1.0.0",
      activate: function () { paint(true); },
      deactivate: function () { paint(false); },
    };
    window.__dshSkins = window.__dshSkins || {};
    window.__dshSkins["${SIM_PEER_ID}"] = {
      mode: "coordinated",
      isActive: function () { return active; },
      activate: payload.activate,
      deactivate: payload.deactivate,
    };
    exports.inject = [];
    exports.apply = function (ctx) {
      var waited = 0;
      var timer = setInterval(function () {
        waited += 100;
        var coord = window.__dshSkinStandaloneV1;
        if (coord) { clearInterval(timer); try { coord.registerSkin(payload); } catch (error) { /* 忽略 */ } return; }
        if (waited >= 9000) clearInterval(timer); // 没有协调器（例如装了真加载器）就什么都不做
      }, 100);
      if (ctx && typeof ctx.effect === "function") {
        ctx.effect(function () { return function () { clearInterval(timer); }; }, "sim peer dispose");
      }
    };
    return module.exports;
  },
});
`

let peerBundle
let peerKind
let peerId
if (PEER_MODE === 'simulated') {
  peerBundle = SIMULATED_PEER; peerKind = 'simulated'; peerId = SIM_PEER_ID
} else {
  const candidate = process.env.OTHER_SKIN_BUNDLE || defaultPeer
  let text = null
  try { text = readFileSync(candidate, 'utf8') } catch { text = null }
  if (text) {
    peerBundle = text
    peerKind = 'real'
    peerId = SELF_ID === 'skins.abyssal' ? 'skins.prts' : 'skins.abyssal'
  } else if (PEER_MODE === 'real') { console.error('FAIL: 找不到对端 bundle: ' + candidate); process.exit(1) }
  else { peerBundle = SIMULATED_PEER; peerKind = 'simulated'; peerId = SIM_PEER_ID }
}

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log('  ok   ' + name)
  else { failures++; console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end('<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>standalone-coordinator</title></head><body></body></html>')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}/`

const newPage = async () => {
  const target = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  })
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression, timeoutMs = 15000) => {
    const call = send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    const timed = new Promise((r) => setTimeout(() => r({ __timeout: true }), timeoutMs))
    const res = await Promise.race([call, timed])
    if (res.__timeout) return { __timeout: true }
    if (res.result?.exceptionDetails) return { __exception: res.result.exceptionDetails.exception?.description ?? 'exception' }
    return res.result?.result?.value
  }
  const close = async () => {
    try { await fetch('http://127.0.0.1:9222/json/close/' + target.id) } catch { /* 忽略 */ }
    try { ws.close() } catch { /* 忽略 */ }
  }
  await send('Page.enable')
  await send('Page.navigate', { url: origin })
  await new Promise((r) => setTimeout(r, 400))
  // 装载两个 bundle：先本仓库的皮肤，再对端
  await evaluate(`
    window.__mods = [];
    window.__ModuleLoader__ = { load: function (m) { window.__mods.push(m); } };
    window.__reactStub = { createElement: function () { return null; }, useState: function () { var s = [null, function () {}]; return s; },
      useEffect: function () {}, useMemo: function (f) { return f(); }, useCallback: function (f) { return f; }, Fragment: null };
    window.__record = { slots: [], locales: [], loaderRegistrations: [] };
    true;
  `, 5000)
  await evaluate(selfBundle, 8000)
  await evaluate(peerBundle, 8000)
  return { evaluate, close, send }
}

// 施加皮肤：loaderApi 为 null = 没有加载器（走协调器）；否则模拟真加载器出现
const applySkins = (loaderApi) => `(function () {
  var record = window.__record;
  function mkCtx(tag) {
    return {
      logger: { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} },
      effect: function (fn) { return typeof fn === 'function' ? fn() : undefined; },
      inject: function (deps, cb) {
        if (${loaderApi ? 'true' : 'false'} && deps.indexOf('uiSkinLoader') >= 0 && typeof cb === 'function') {
          try { cb({ uiSkinLoader: window.__fakeLoader }); } catch (error) { /* 忽略 */ }
        }
        return function () {};
      },
      theme: { register: function () { return function () {}; }, overrideTokens: function () { return function () {}; } },
      slots: {
        inject: function (key, cb) { record.slots.push('inject:' + key); if (typeof cb === 'function') cb(); return function () {}; },
        register: function (opts, comp) { record.slots.push('section:' + opts.id); return function () {}; },
      },
      locale: {
        register: function (ns, dicts) { record.locales.push(ns); return function () {}; },
        bind: function (ns) { return function (k) { return ns + ':' + k; }; },
      },
    };
  }
  var mods = window.__mods;
  if (mods.length !== 2) return { fatal: 'expected 2 modules, got ' + mods.length };
  try { mods[0].factory(function () { return window.__reactStub; }).apply(mkCtx('self')); }
  catch (error) { return { fatal: 'self apply threw: ' + String(error) }; }
  try { mods[1].factory(function () { return window.__reactStub; }).apply(mkCtx('peer')); }
  catch (error) { return { fatal: 'peer apply threw: ' + String(error) }; }
  return { ok: true };
})()`

const snapshot = `(function () {
  var coord = window.__dshSkinStandaloneV1 || null;
  var skins = window.__dshSkins || {};
  var actives = Object.keys(skins).filter(function (id) { return skins[id] && typeof skins[id].isActive === 'function' && skins[id].isActive(); });
  return {
    coordinator: coord ? { protocol: coord.protocol, kind: coord.kind, current: coord.current(), list: coord.list() } : null,
    actives: actives,
    stored: (function () { try { return localStorage.getItem('dsh.skin.standalone.v1'); } catch (error) { return 'ERR'; } })(),
    sections: window.__record.slots.filter(function (s) { return s.indexOf('section:') === 0; }),
    locales: window.__record.locales,
    markers: {
      self: document.body.hasAttribute('${SELF_ID === 'skins.abyssal' ? 'data-skn-abyssal' : 'data-skn-prts'}'),
      peer: ${peerKind === 'real' ? `document.body.hasAttribute('${peerId === 'skins.abyssal' ? 'data-skn-abyssal' : 'data-skn-prts'}')` : `document.body.hasAttribute('data-sim-peer')`},
    },
    loaderRegistrations: window.__record.loaderRegistrations.length,
  };
})()`

console.log('自立协调器回归')
console.log('  self : ' + (process.env.SKIN_BUNDLE ?? '(repo lib/client.js)') + ' (' + SELF_ID + ')')
console.log('  peer : ' + peerKind + ' (' + peerId + ')')

// ---------------------------------------------------------------- 场景 1-3
{
  const page = await newPage()
  const applied = await page.evaluate(applySkins(false), 8000)
  if (applied?.fatal) check('两个皮肤 apply 不抛错', false, applied.fatal)
  else {
    await new Promise((r) => setTimeout(r, 4200)) // 过 3 秒宽限 → 走协调器
    const s1 = await page.evaluate(snapshot, 8000)
    check('没有加载器时建立了自立协调器', s1?.coordinator && s1.coordinator.protocol === 1 && s1.coordinator.kind === 'standalone-coordinator', JSON.stringify(s1?.coordinator))
    check('两款皮肤都登记进来了', s1?.coordinator && s1.coordinator.list.length === 2, JSON.stringify(s1?.coordinator?.list))
    check('恰好一款生效（不再各干个的）', s1?.actives.length === 1, JSON.stringify(s1?.actives))
    check('生效的那款 = current()', s1?.coordinator && s1.actives[0] === s1.coordinator.current, 'actives=' + JSON.stringify(s1?.actives) + ' current=' + s1?.coordinator?.current)
    check('协调器注册了常驻的「皮肤」小节', Array.isArray(s1?.sections) && s1.sections.indexOf('section:skin-standalone-selector') >= 0, JSON.stringify(s1?.sections))
    check('只用了自己的 locale 命名空间（不碰加载器保留面）', Array.isArray(s1?.locales) && s1.locales.indexOf('skn-standalone') >= 0 && s1.locales.every((n) => !String(n).startsWith('usl-')), JSON.stringify(s1?.locales))
    check('非生效皮肤确实没有应用观感', (s1.actives[0] === SELF_ID) === (s1.markers.self === true) && (s1.actives[0] === peerId) === (s1.markers.peer === true), JSON.stringify(s1?.markers))

    // 场景 2：切到对端
    const s2 = await page.evaluate(`(function () {
      window.__dshSkinStandaloneV1.switchTo('${peerId}');
      var skins = window.__dshSkins || {};
      var actives = Object.keys(skins).filter(function (id) { return skins[id] && skins[id].isActive && skins[id].isActive(); });
      return { actives: actives, current: window.__dshSkinStandaloneV1.current(),
               stored: localStorage.getItem('dsh.skin.standalone.v1'),
               selfMarker: document.body.hasAttribute('${SELF_ID === 'skins.abyssal' ? 'data-skn-abyssal' : 'data-skn-prts'}'),
               peerMarker: ${peerKind === 'real' ? `document.body.hasAttribute('${peerId === 'skins.abyssal' ? 'data-skn-abyssal' : 'data-skn-prts'}')` : `document.body.hasAttribute('data-sim-peer')`} };
    })()`, 8000)
    check('切到另一款后只有它生效（互斥）', s2?.actives.length === 1 && s2.actives[0] === peerId, JSON.stringify(s2?.actives))
    check('切换后选择被持久化', s2?.stored === peerId, String(s2?.stored))
    check('切换后观感标记互换', s2?.selfMarker === false && s2?.peerMarker === true, JSON.stringify(s2))

    // 场景 3：回原生
    const s3 = await page.evaluate(`(function () {
      window.__dshSkinStandaloneV1.switchTo('default');
      var skins = window.__dshSkins || {};
      var actives = Object.keys(skins).filter(function (id) { return skins[id] && skins[id].isActive && skins[id].isActive(); });
      return { actives: actives, current: window.__dshSkinStandaloneV1.current(),
               stored: localStorage.getItem('dsh.skin.standalone.v1'),
               selfMarker: document.body.hasAttribute('${SELF_ID === 'skins.abyssal' ? 'data-skn-abyssal' : 'data-skn-prts'}') };
    })()`, 8000)
    check('选「原生」后没有任何皮肤生效', s3?.actives.length === 0 && s3?.selfMarker === false, JSON.stringify(s3))
    check('「原生」也被持久化', s3?.stored === 'default', String(s3?.stored))
  }
  await page.close()
}

// ---------------------------------------------------------------- 场景 4：持久化恢复
{
  const page = await newPage()
  await page.evaluate(`localStorage.setItem('dsh.skin.standalone.v1', '${peerId}'); true;`, 5000)
  const applied = await page.evaluate(applySkins(false), 8000)
  if (applied?.fatal) check('（持久化场景）apply 不抛错', false, applied.fatal)
  else {
    await new Promise((r) => setTimeout(r, 4200))
    const s4 = await page.evaluate(snapshot, 8000)
    check('新页面按上次选择恢复生效的皮肤', s4?.coordinator && s4.coordinator.current === peerId && s4.actives.length === 1 && s4.actives[0] === peerId, JSON.stringify({ current: s4?.coordinator?.current, actives: s4?.actives }))
  }
  await page.close()
}

// ---------------------------------------------------------------- 场景 5：有加载器时不介入
{
  const page = await newPage()
  await page.evaluate(`
    window.__fakeLoader = {
      registerSkin: function (payload) { window.__record.loaderRegistrations.push(payload && payload.id); return function () {}; },
      list: function () { return []; }, current: function () { return 'default'; },
      switchTo: function () {}, subscribe: function () { return function () {}; },
    };
    true;
  `, 5000)
  const applied = await page.evaluate(applySkins(true), 8000)
  if (applied?.fatal) check('（加载器场景）apply 不抛错', false, applied.fatal)
  else {
    await new Promise((r) => setTimeout(r, 4200))
    const s5 = await page.evaluate(snapshot, 8000)
    check('有加载器时绝不创建自立协调器', s5?.coordinator === null, JSON.stringify(s5?.coordinator))
    check('有加载器时走控制台登记（真实对端=2，内建对端只算本皮肤=1）',
      s5?.loaderRegistrations === (peerKind === 'real' ? 2 : 1), String(s5?.loaderRegistrations))
  }
  await page.close()
}

server.close()
try { if (typeof server.closeAllConnections === 'function') server.closeAllConnections() } catch { /* 忽略 */ }

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
const kick = setTimeout(() => process.exit(failures === 0 ? 0 : 1), 150)
if (typeof kick.unref === 'function') kick.unref()
process.exitCode = failures === 0 ? 0 : 1
