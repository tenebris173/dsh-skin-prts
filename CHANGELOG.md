# 更新记录

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
- 30 项真实浏览器断言全过（含两套底的 CSS 层叠与 teardown 净场）。
