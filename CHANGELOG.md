# 更新记录

## 1.0.5

- **新增「还原原生皮肤」选项**（设置面板里每款皮肤都有）：一点即恢复宿主原生外观。
  - 装了控制台 → 本地立即卸下，并调用控制台的 `switchTo("default")`（控制台自己的"还原默认观感"就是这个），
    持久化由它负责；
  - 没装控制台（自立模式） → 关掉启用开关，立即卸下并**长期保持原生**，随时可再打开。
- 该能力同时暴露到统一接口：`window.__dshSkins[skinId].restoreNative()`，控制台或脚本可直接调用。
- 新增 `tests/restore-native.mjs`（17 项：两种模式的还原路径、switchTo 调用、开关状态、接口可用性）并接入 CI。
  当前断言总数：浏览器 32 + 自立 15 + 还原 17 + 依赖 7 = **71 项**。

## 1.0.4

- **不再依赖控制台：皮肤可以独立运行了。** 此前 client 半用 `inject: ["uiSkinLoader", …]` 等待
  第三方皮肤控制台下发 SkinContext —— 没装控制台的安装者会得到一个"装好了但什么都没发生"的状态。
  现在改成两种模式共用一套代码：
  - **有控制台** → `registerSkin()` 登记托管（卡片墙 / 互斥切换 / 持久化交给它）；
  - **没控制台** → **自立模式**：装完重启即自动应用外观，并在「设置 → PRTS」里提供
    **启用开关**与全部调节项（关掉立刻恢复原生界面，随时再打开）。
- **统一对外接口** `window.__dshSkins[skinId]`：`mode / isActive() / activate() / deactivate() / getSettings() / setSettings()`，
  控制台或脚本都能驱动，不必再猜内部结构。
- **多皮肤共存协商**：自立模式下用 `dsh.skin.standalone.owner.v1` 定归属，后启动的让位；
  设置面板提供「改用本皮肤」按钮（点击刷新后接管）。
- `inject` 收敛为 `["theme", "slots", "locale"]`（宿主基础服务），不再要求任何第三方插件。
- 新增 `tests/standalone.mjs`（15 项断言：无控制台时自动生效 / 接口可用 / 开关能卸能装 /
  让位 / 卸载净场），并接入 CI。当前断言总数：浏览器 31 + 自立 15 + 依赖 7 = **53 项**。

## 1.0.3

- **补上"依赖皮肤加载器"这件事的可见性**。本皮肤是纯观感包，靠 `inject: ["uiSkinLoader", …]` 等待
  第三方皮肤加载器（参考实现 `@dsh-eac/ui-skin-loader`）下发 SkinContext。此前若安装者没装加载器，
  插件会**安静挂起**——不报错、也没效果，容易被误判成"装失败"。现在：
  - 宿主半新增**依赖自检**：启动后延迟 4 秒确认 `uiSkinLoader` 是否可用，缺失时打印可操作提示；
  - `package.json` 增加 `dsh.skin.requires` 元数据（服务名 + 参考实现 + 说明）；
  - README 增加「前置要求」小节（含"没装会怎样"的对照表）；安装脚本增加装载前预检；
  - 新增 `tests/dependency-check.mjs`（6 项断言：缺服务必警告 / 有服务保持安静 / `ctx.get` 亦识别 / 卸载后不再触发），并接入 CI。
- 说明：加载器是第三方插件、不随本包分发，也不写进 npm 依赖（它在 registry 上不存在，声明成 peer 反而会让安装失败）。

## 1.0.2

- **修：宿主重写亮暗开关时的兜底**。PRTS 此前只在自己 `apply()` 时驱动
  `body[data-ds-dark-theme]`；若宿主（跟随系统 / 手动切亮暗）自行改写它，档位就会与皮肤不一致。
  现在用 `MutationObserver` 按当前有效底复位，teardown 时断开。
- 新增端到端扫测（CDP 模拟 `prefers-color-scheme: light`、真实设置弹窗、连切压力、二次激活），23 项全过。

## 1.0.1

- **命名空间去个人化**：包名统一为 `dsh-skin-prts`，皮肤 id 统一为 `skins.prts`，
  主题 id 为 `skins-theme-prts`，cordis 行 id 同步调整；作者、版权署名与文档里的
  本机绝对路径一并去个人化。
- **主题注册兜底**：新增 `registerThemeSafe` —— 宿主对重复 theme id 会抛错并把整次激活
  回滚成默认皮肤（皮肤被重新加载后新实例可能撞上），现在改用带序号的 id 兜底。
- `package.json` 补 `keywords`（含 `dsh-plugin`），`dsh.skin.tags` 同步补 `dsh-plugin`；
  按 DeepSeek Harness 官方 README 要求给仓库打上 `dsh-plugin` topic。

## 1.0.0

- 首个版本：纸面（亮）/ 终端（暗）两套底，可跟随应用主题；3 强调色 × 3 圆角档 ×
  纹理 / 硬投影 / DIN 技术字开关；全屏细网格 + 扫描线 + 左缘警示条 + 四角登记标记；
  黑底白字面板头 + 错位实心影 + 黄色数字块。
- 32 项真实浏览器断言全过（含两套底的 CSS 层叠与 teardown 净场）。
