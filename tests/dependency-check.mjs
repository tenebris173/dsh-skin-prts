/**
 * 依赖自检测试：宿主半在缺少皮肤加载器时必须给出可操作的提示。
 *
 * 背景：皮肤的全部观感在 client 半，靠 `inject: ["uiSkinLoader", ...]` 等待加载器下发
 * SkinContext。加载器缺失时 Cordis 会让插件静默挂起 —— 不报错、也没效果。
 * 宿主半因此加了一次延迟自检，本测试保证它：
 *   1) 缺服务时确实警告，且信息里含服务名与参考实现名
 *   2) 有服务时保持安静
 *   3) 插件卸载（dispose）后不再触发
 *
 * 用法：node tests/dependency-check.mjs
 */
import { apply } from '../lib/index.js'

const NAME = 'PRTS'

const WAIT = 4600
let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log('  ok   ' + name)
  else { failures++; console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}

const makeCtx = (extra = {}) => {
  const warnings = []
  const disposers = []
  const ctx = {
    logger: { warn: (m) => warnings.push(String(m)), info: () => {}, error: () => {} },
    effect: (fn, label) => { const d = typeof fn === 'function' ? fn() : undefined; disposers.push(d); return d },
    ...extra,
  }
  return { ctx, warnings, disposers }
}

console.log('依赖自检（宿主半）')

// 1) 没有 uiSkinLoader → 应警告
{
  const { ctx, warnings } = makeCtx()
  apply(ctx)
  await new Promise((r) => setTimeout(r, WAIT))
  const msg = warnings[0] || ''
  check('缺服务时发出提示', warnings.length === 1, warnings.length + ' 条')
  check('提示里点名了服务与参考实现', msg.includes('uiSkinLoader') && msg.includes('@dsh-eac/ui-skin-loader'), msg.slice(0, 80))
  check('提示里说明会以自立模式运行', msg.includes('自立模式'), msg.slice(0, 90))
  check('提示里指出在哪里调整', msg.includes('设置 → ' + NAME) || msg.includes('设置'), msg.slice(0, 90))
}

// 2) 有 uiSkinLoader → 应安静
{
  const { ctx, warnings } = makeCtx({ uiSkinLoader: { registerSkin: () => () => {} } })
  apply(ctx)
  await new Promise((r) => setTimeout(r, WAIT))
  check('有服务时不打扰用户', warnings.length === 0, warnings.join(' | '))
}

// 3) 服务通过 ctx.get 暴露时也算存在
{
  const registry = { uiSkinLoader: { registerSkin: () => () => {} } }
  const { ctx, warnings } = makeCtx({ get: (name) => registry[name] })
  apply(ctx)
  await new Promise((r) => setTimeout(r, WAIT))
  check('通过 ctx.get 也能识别服务', warnings.length === 0, warnings.join(' | '))
}

// 4) dispose 后不再触发
{
  const { ctx, warnings, disposers } = makeCtx()
  apply(ctx)
  for (const d of disposers) if (typeof d === 'function') d()
  await new Promise((r) => setTimeout(r, WAIT))
  check('卸载后不再触发自检', warnings.length === 0, warnings.join(' | '))
}

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
