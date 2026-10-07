/**
 * 多皮肤亮暗开关冲突回归测试 —— 在真实浏览器里同时激活两个"皮肤"。
 *
 * 背景（本测试防的就是它）：
 *   两个皮肤各自装了一个盯 body[data-ds-dark-theme] 的 MutationObserver，期望值可以相反
 *   （纯暗色皮肤要"有"，可切亮暗的皮肤在纸面档要"没有"）。两者同时生效时会互相复写：
 *   A 写 → B 改 → A 写 …… 这是微任务级死循环，渲染进程事件循环被完全占死（界面点不动），
 *   同时不断分配对象，内存约 1GB/分钟暴涨，最终把整机内存耗尽。
 *
 * 触发条件：没装 @dsh-eac/ui-skin-loader 时，两个皮肤都会在 3 秒宽限后进入 standalone
 *   模式并同时生效。
 *
 * 对手（peer）有两种：
 *   - real      ：显式指定 / 同级目录里的另一个真实皮肤 bundle（OTHER_SKIN_BUNDLE 或 PEER=real）
 *   - simulated ：内建的对立皮肤（默认兜底，CI 走这条）—— 一个不受仲裁器约束、坚持
 *                 "body 上不该有 data-ds-dark-theme"的野生守卫，用来验证写入熔断。
 *   默认 auto：找得到真实对端就用真实的，否则用内建的。这样本测试不依赖仓库目录布局。
 *
 * 断言：
 *   1) 两个皮肤都进入 standalone（构造出危险配置）
 *   2) 改写次数有界（补丁前：死循环，页面直接卡死）
 *   3) 仲裁器存在、本皮肤拿到所有权、属性最终值 = 本皮肤的期望值
 *   4) 真实对端：落败方收到可操作告警，且持有者释放后按优先级移交给它
 *      内建对端：写入熔断被触发（第三方不受协议约束时也会停手，不会把浏览器拖死）
 *
 * 前置：Chrome 以 --remote-debugging-port=9222 启动（与 browser-smoke.mjs 相同）。
 * 用法：node tests/scheme-conflict.mjs
 *   PEER=simulated node tests/scheme-conflict.mjs          # 只用内建对端
 *   OTHER_SKIN_BUNDLE=/path/to/other/lib/client.js ...     # 指定真实对端
 *   SKIN_BUNDLE=lib/client.js.bak-xxx node tests/...       # 跑旧代码应失败（复现 bug）
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const selfBundle = readFileSync(process.env.SKIN_BUNDLE ?? path.join(here, '..', 'lib', 'client.js'), 'utf8')

// 内建对端：一个"纸面档"皮肤，只做一件事——坚持 body 上没有 data-ds-dark-theme。
// 刻意不接入仲裁器，用来验证熔断（现实里可能是尚未升级的旧版皮肤或第三方脚本）。
const SIMULATED_PEER = `
window.__ModuleLoader__.load({
  id: "simulated-conflicting-skin",
  factory: function () {
    var module = { exports: {} };
    var exports = module.exports;
    var ATTR = "data-ds-dark-theme";
    exports.inject = [];
    exports.apply = function (ctx) {
      var guard = new MutationObserver(function () {
        if (document.body.hasAttribute(ATTR)) document.body.removeAttribute(ATTR);
      });
      guard.observe(document.body, { attributes: true, attributeFilter: [ATTR] });
      if (document.body.hasAttribute(ATTR)) document.body.removeAttribute(ATTR);
      document.body.setAttribute("data-sim-conflicting-skin", "");
      if (ctx && typeof ctx.effect === "function") {
        ctx.effect(function () { return function () { guard.disconnect(); document.body.removeAttribute("data-sim-conflicting-skin"); }; }, "sim peer dispose");
      }
      window.__dshSkins = window.__dshSkins || {};
      window.__dshSkins["simulated.peer"] = {
        mode: "standalone",
        deactivate: function () { guard.disconnect(); document.body.removeAttribute("data-sim-conflicting-skin"); },
      };
    };
    return module.exports;
  },
});
`

const PEER_MODE = process.env.PEER ?? 'auto' // auto | real | simulated
const defaultPeer = path.join(here, '..', '..', process.env.PEER_REPO ?? 'dsh-abyssal-eac', 'lib', 'client.js')
let peerBundle
let peerKind
if (PEER_MODE === 'simulated') {
  peerBundle = SIMULATED_PEER
  peerKind = 'simulated'
} else {
  const candidate = process.env.OTHER_SKIN_BUNDLE || defaultPeer
  let text = null
  try { text = readFileSync(candidate, 'utf8') } catch { text = null }
  if (text) { peerBundle = text; peerKind = 'real' }
  else if (PEER_MODE === 'real') { console.error('FAIL: 找不到对端 bundle: ' + candidate); process.exit(1) }
  else { peerBundle = SIMULATED_PEER; peerKind = 'simulated' }
}

// 本测试在两个仓库各有一份：self 是所在仓库的皮肤，peer 是另一个（或内建）。
// 所有权应归"优先级更高且在页面里"的那个：ABYSSAL 100 > PRTS 50。
const SELF_ID = process.env.SELF_SKIN_ID ?? 'skins.prts'
const peerId = peerKind === 'real' ? (SELF_ID === 'skins.abyssal' ? 'skins.prts' : 'skins.abyssal') : null
const expectedOwner = [SELF_ID, peerId].includes('skins.abyssal') ? 'skins.abyssal' : 'skins.prts'
// PRTS 的档位必须和对手相反，否则构不成冲突：
//   真实对手 ABYSSAL 要"有"该属性 → PRTS 纸面档（paper）
//   内建对手坚持"没有"该属性     → PRTS 终端档（terminal）
const prtsAppearance = peerKind === 'real' ? 'paper' : 'terminal'
const prtsInPage = SELF_ID === 'skins.prts' || peerId === 'skins.prts'

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log('  ok   ' + name)
  else { failures++; console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}

// 真实 origin（localStorage 在 about:blank 的 opaque origin 下会被拒）
const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end('<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>skin-conflict</title></head><body></body></html>')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}/`

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
  if (res.result?.exceptionDetails) {
    return { __exception: res.result.exceptionDetails.exception?.description ?? JSON.stringify(res.result.exceptionDetails).slice(0, 400) }
  }
  return res.result?.result?.value
}

console.log('多皮肤亮暗开关冲突回归')
console.log('  self : ' + (process.env.SKIN_BUNDLE ?? '(repo lib/client.js)'))
console.log('  peer : ' + peerKind)

// 页面被死循环卡死时，CDP 的 WebSocket 关不干净会拖住事件循环 —— 必须能硬退，
// 否则 CI 撞上这个回归会一直挂着而不是快速失败。
let hardExit = false
try {
  await send('Page.enable')
  await send('Page.navigate', { url: origin })
  await new Promise((r) => setTimeout(r, 400))

  await evaluate(`
    window.__mods = [];
    window.__ModuleLoader__ = { load: function (m) { window.__mods.push(m); } };
    window.__reactStub = { createElement: function () { return null; }, useState: function () { var s = [null, function () {}]; return s; },
      useEffect: function () {}, useMemo: function (f) { return f(); }, useCallback: function (f) { return f; }, Fragment: null };
    true;
  `, 5000)
  await evaluate(selfBundle, 8000)
  await evaluate(peerBundle, 8000)

  const phase1 = await evaluate(`(async () => {
    const logs = [];
    const mutations = { count: 0 };
    const bodyObs = new MutationObserver(function (recs) { mutations.count += recs.length; });
    bodyObs.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });

    const mkCtx = function (tag) {
      return {
        logger: { debug: function () {}, info: function () {}, warn: function (m) { logs.push(tag + ': ' + m); }, error: function () {} },
        effect: function (fn) { return typeof fn === 'function' ? fn() : undefined; },
        inject: function () { return function () {}; },              // 没有 uiSkinLoader → standalone 兜底
        theme: { register: function () { return function () {}; }, overrideTokens: function () { return function () {}; } },
        slots: { inject: function () { return function () {}; }, register: function () { return function () {}; } },
        locale: { register: function () { return function () {}; }, bind: function () { return function (k) { return k; }; } },
      };
    };
    const mods = window.__mods;
    if (mods.length !== 2) return { fatal: 'expected 2 modules, got ' + mods.length };

    // 构造真实冲突：本皮肤（ABYSSAL 纯暗色 / PRTS 纸面档）+ 期望相反的对端
    const seed = function (key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 忽略 */ } };
    seed('dsh.skin.abyssal.preferences.v1', { enabled: true });
    seed('dsh.skin.prts.preferences.v1', { enabled: true, appearance: '${prtsAppearance}' });

    const expA = mods[0].factory(function () { return window.__reactStub; });
    const expB = mods[1].factory(function () { return window.__reactStub; });
    expA.apply(mkCtx('a'));
    expB.apply(mkCtx('b'));

    // 等过 3 秒宽限期（两个皮肤都会自立），然后量 2 秒内的改写次数
    await new Promise(function (r) { setTimeout(r, 3600); });
    mutations.count = 0;
    await new Promise(function (r) { setTimeout(r, 2000); });

    const skins = window.__dshSkins || {};
    const arb = window.__dshHostSchemeArbiterV1 || null;
    return {
      mutationCount: mutations.count,
      owner: arb ? arb.ownerId() : null,
      suspended: arb ? arb.isSuspended() : null,
      attr: document.body.hasAttribute('data-ds-dark-theme'),
      prtsMode: document.documentElement.getAttribute('data-skn-prts-mode'),
      modes: Object.keys(skins).map(function (k) { return k + '=' + skins[k].mode; }),
      skinIds: Object.keys(skins),
      logs: logs,
    };
  })()`, 12000)

  if (phase1?.__timeout) {
    hardExit = true
    check('两个皮肤同时 standalone 后事件循环仍然存活', false,
      '渲染进程被卡死（补丁前行为：无限互写把事件循环占满）')
  } else if (phase1?.__exception || phase1?.fatal) {
    check('测试脚本执行', false, phase1.__exception || phase1.fatal)
  } else {
    const bothStandalone = phase1.modes.length === 2 && phase1.modes.every((m) => m.endsWith('=standalone'))
    check('两个皮肤都进入 standalone（构造出危险配置）', bothStandalone, phase1.modes.join(', '))
    check('事件循环仍然存活（测试跑完了）', true)
    if (prtsInPage) {
      check('PRTS 处于与对手相反的档位（冲突成立）',
        phase1.prtsMode === prtsAppearance, 'prtsMode=' + phase1.prtsMode + ' expected=' + prtsAppearance)
    }
    if (peerKind === 'real') {
      check('2 秒内 body[data-ds-dark-theme] 改写次数有界（≤ 5）',
        typeof phase1.mutationCount === 'number' && phase1.mutationCount <= 5, String(phase1.mutationCount))
    } else {
      check('未接入协议的第三方反复改写时，写入次数被熔断压住（≤ 60）',
        typeof phase1.mutationCount === 'number' && phase1.mutationCount <= 60, String(phase1.mutationCount))
      check('写入熔断已触发', phase1.suspended === true, String(phase1.suspended))
    }
    check('仲裁器只有一个持有者，且归优先级更高的那个',
      phase1.owner === expectedOwner, 'owner=' + phase1.owner + ' expected=' + expectedOwner)
    if (peerKind === 'real') {
      check('属性最终值 = 持有者的期望值', phase1.attr === true, 'owner=' + phase1.owner + ' attr=' + phase1.attr)
    } else {
      // 内建对端不接入协议：熔断触发后仲裁器主动停手（这是刻意的权衡——
      // 宁可由第三方决定这一档，也不能无限互写把渲染进程拖死）。
      check('熔断后停止互写（最终值交给第三方，但不再循环）', phase1.suspended === true, String(phase1.suspended))
    }

    if (peerKind === 'real') {
      check('落败方给出可操作告警（含 ui-skin-loader 提示）',
        phase1.logs.some((l) => (l.includes('yielding') || l.includes('taken over')) && l.includes('ui-skin-loader')),
        phase1.logs.filter((l) => l.includes('ui-skin-loader')).join(' | ').slice(0, 200))

      // 移交：持有者下台，等待者接管
      const phase2 = await evaluate(`(async () => {
        const skins = window.__dshSkins || {};
        const arb = window.__dshHostSchemeArbiterV1;
        if (!arb || !skins['skins.abyssal'] || !skins['skins.prts']) return { fatal: 'arbiter or skins missing' };
        const first = arb.ownerId();
        const loser = first === 'skins.abyssal' ? 'skins.prts' : 'skins.abyssal';
        skins[first].deactivate();
        await new Promise(function (r) { setTimeout(r, 300); });
        return { first: first, expected: loser, after: arb.ownerId(), attr: document.body.hasAttribute('data-ds-dark-theme') };
      })()`, 8000)
      check('持有者释放后移交给等待者',
        phase2 && !phase2.__timeout && !phase2.__exception && !phase2.fatal && phase2.after === phase2.expected,
        JSON.stringify(phase2).slice(0, 200))
    }
  }
} finally {
  try { await fetch('http://127.0.0.1:9222/json/close/' + target.id) } catch { /* 忽略 */ }
  try { ws.close() } catch { /* 忽略 */ }
  try { if (typeof server.closeAllConnections === 'function') server.closeAllConnections() } catch { /* 忽略 */ }
  server.close()
  await new Promise((r) => setTimeout(r, 150)) // 让 CDP socket 收尾
}

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
// 保底硬退：页面卡死（CDP 关不干净）或 keep-alive 连接都会拖住事件循环，
// 不给 CI 留"挂到 job 超时"的机会。
const kick = setTimeout(() => process.exit(failures === 0 ? 0 : 1), 150)
if (typeof kick.unref === 'function') kick.unref()
process.exitCode = failures === 0 ? 0 : 1
