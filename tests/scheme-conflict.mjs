/**
 * 多皮肤亮暗开关冲突回归测试 —— 在真实浏览器里同时激活两个皮肤。
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
 * 断言：
 *   1) 两个皮肤确实都进入 standalone（构造出危险配置）
 *   2) 2 秒窗口内 body[data-ds-dark-theme] 的改写次数有界（补丁前：死循环，页面直接卡死）
 *   3) 仲裁器存在且只有一个持有者，落败方给出可操作告警
 *   4) 持有者释放后，属性按优先级移交给等待者
 *
 * 前置：Chrome 以 --remote-debugging-port=9222 启动（与 browser-smoke.mjs 相同）。
 * 用法：node tests/scheme-conflict.mjs
 *   SKIN_BUNDLE / OTHER_SKIN_BUNDLE 可指向别的 bundle（例如 .bak-arbiter-* 复现旧行为）
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const selfBundle = readFileSync(process.env.SKIN_BUNDLE ?? path.join(here, '..', 'lib', 'client.js'), 'utf8')
const otherBundle = readFileSync(process.env.OTHER_SKIN_BUNDLE ?? path.join(here, '..', '..', 'dsh-prts-eac', 'lib', 'client.js'), 'utf8')

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
console.log('  other: ' + (process.env.OTHER_SKIN_BUNDLE ?? '(sibling repo lib/client.js)'))

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
  await evaluate(otherBundle, 8000)

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

    // 构造真实冲突：ABYSSAL 纯暗色（要"有"），PRTS 强制纸面档（要"没有"）
    const seed = function (key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 忽略 */ } };
    seed('dsh.skin.abyssal.preferences.v1', { enabled: true });
    seed('dsh.skin.prts.preferences.v1', { enabled: true, appearance: 'paper' });

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
      logs: logs,
    };
  })()`, 20000)

  if (phase1?.__timeout) {
    check('两个皮肤同时 standalone 后事件循环仍然存活', false,
      '渲染进程被卡死（补丁前行为：无限互写把事件循环占满）')
  } else if (phase1?.__exception || phase1?.fatal) {
    check('测试脚本执行', false, phase1.__exception || phase1.fatal)
  } else {
    check('两个皮肤都进入 standalone（构造出危险配置）',
      phase1.modes.length === 2 && phase1.modes.every((m) => m.endsWith('=standalone')), phase1.modes.join(', '))
    check('PRTS 处于纸面档（与 ABYSSAL 的暗色要求相反）', phase1.prtsMode === 'paper', String(phase1.prtsMode))
    check('2 秒内 body[data-ds-dark-theme] 改写次数有界（≤ 5）',
      typeof phase1.mutationCount === 'number' && phase1.mutationCount <= 5, String(phase1.mutationCount))
    check('仲裁器只有一个持有者，且优先级更高者（ABYSSAL=100）拿到所有权',
      phase1.owner === 'skins.abyssal', String(phase1.owner))
    check('属性最终值 = 持有者的期望值',
      phase1.attr === true, 'owner=' + phase1.owner + ' attr=' + phase1.attr)
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
} finally {
  try { await fetch('http://127.0.0.1:9222/json/close/' + target.id) } catch { /* 忽略 */ }
  try { ws.close() } catch { /* 忽略 */ }
  server.close()
  await new Promise((r) => setTimeout(r, 150)) // 让 CDP socket 收尾，避免退出期 libuv 断言
}

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
process.exitCode = failures === 0 ? 0 : 1
