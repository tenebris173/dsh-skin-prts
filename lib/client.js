/**
 * PRTS — DSH UI 皮肤（皮肤加载器公约 dsh.ecosystem.ui-skin-loader/v1）
 * ============================================================================
 * 罗德岛终端风格：浅色纸面 / 作战终端两套底，直角切角、黑色发丝线、黄黑警示条、
 * 四角登记标记、DIN 技术字。信息靠线宽与字距分层，不用圆角与柔光。
 *
 * 与深渊（ABYSSAL）的关键差别
 *   - 深渊是"深色 + 玻璃 + 单光源"；PRTS 是"实心纸面/实心终端 + 强边界线"。
 *     所以本皮肤的表面 token 基本是**不透明**的（弹窗当然也不透）。
 *   - 支持亮/暗两套底，并可跟随应用主题：读 ctx.theme.getTheme().preference，
 *     跟随系统时用 prefers-color-scheme 判断；变化时自动重算（1s 轮询 + matchMedia）。
 *   - 会注入**自有装饰层**（网格+扫描线覆盖、四角登记标记、左缘警示条），
 *     全部 pointer-events:none、自有 data 属性、退出时整体移除。
 *
 * 生命周期纪律（公约 §4.3 / R8）：activate 的每项副作用都登记 disposer，
 * teardown 幂等；deactivate / signal abort / fiber 意外 dispose 三路汇合。
 */
window.__ModuleLoader__.load({
	id: "dsh-skin-prts",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var React = require("react");

		//#region 身份
		var SKIN_ID = "skins.prts";
		var SKIN_NAME = "PRTS";
		var THEME_ID = "skins-theme-prts";
		var CSS_PREFIX = "skn-prts";
		var BODY_ATTR = "data-skn-prts";
		var STYLE_ATTR = "data-skn-prts-style";
		var CHROME_ATTR = "data-skn-prts-chrome";
		var SECTION_ID = CSS_PREFIX + "-settings";
		var LOCALE_NS = "skn-prts";
		var STORAGE_KEY = "dsh.skin.prts.preferences.v1";
		var VERSION = "1.0.8";

		/** 卡片墙用的内联预览（渐变 id 带前缀，防文档级冲突）。 */
		var PREVIEW_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 320 180\" role=\"img\" aria-label=\"PRTS\">"
			+ "<rect width=\"320\" height=\"180\" fill=\"#f4f5f7\"/>"
			+ "<g opacity=\".07\" stroke=\"#111417\" stroke-width=\"1\">"
			+ "<path d=\"M0 16h320M0 32h320M0 48h320M0 64h320M0 80h320M0 96h320M0 112h320M0 128h320M0 144h320M0 160h320M16 0v180M32 0v180M48 0v180M64 0v180M80 0v180M96 0v180M112 0v180M128 0v180M144 0v180M160 0v180M176 0v180M192 0v180M208 0v180M224 0v180M240 0v180M256 0v180M272 0v180M288 0v180M304 0v180\"/>"
			+ "</g>"
			+ "<rect x=\"0\" y=\"0\" width=\"320\" height=\"18\" fill=\"#111417\"/>"
			+ "<rect x=\"0\" y=\"0\" width=\"42\" height=\"18\" fill=\"#f7b500\"/>"
			+ "<text x=\"21\" y=\"13\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"9\" font-weight=\"700\" letter-spacing=\".18em\" fill=\"#111417\">PRTS</text>"
			+ "<text x=\"52\" y=\"12.5\" font-family=\"monospace\" font-size=\"7\" letter-spacing=\".16em\" fill=\"#e9edf0\">SYSTEM ONLINE</text>"
			+ "<rect x=\"0\" y=\"162\" width=\"320\" height=\"18\" fill=\"#ffffff\" stroke=\"#111417\" stroke-width=\"1\"/>"
			+ "<g opacity=\".35\" stroke=\"#111417\"><path d=\"M0 171h320\"/></g>"
			+ "<rect x=\"8\" y=\"26\" width=\"92\" height=\"128\" fill=\"#ffffff\" stroke=\"#111417\" stroke-width=\"1.2\"/>"
			+ "<rect x=\"8\" y=\"26\" width=\"92\" height=\"14\" fill=\"#111417\"/>"
			+ "<rect x=\"12\" y=\"30\" width=\"6\" height=\"6\" fill=\"#f7b500\"/>"
			+ "<g fill=\"#8b939d\"><rect x=\"16\" y=\"50\" width=\"60\" height=\"3\"/><rect x=\"16\" y=\"60\" width=\"72\" height=\"3\"/><rect x=\"16\" y=\"70\" width=\"48\" height=\"3\"/><rect x=\"16\" y=\"80\" width=\"66\" height=\"3\"/></g>"
			+ "<rect x=\"16\" y=\"50\" width=\"0\" height=\"0\"/>"
			+ "<rect x=\"16\" y=\"94\" width=\"76\" height=\"12\" fill=\"#111417\"/>"
			+ "<rect x=\"16\" y=\"112\" width=\"76\" height=\"12\" fill=\"#ffffff\" stroke=\"#111417\"/>"
			+ "<rect x=\"16\" y=\"112\" width=\"3\" height=\"12\" fill=\"#f7b500\"/>"
			+ "<rect x=\"16\" y=\"132\" width=\"76\" height=\"12\" fill=\"#ffffff\" stroke=\"#111417\"/>"
			+ "<rect x=\"16\" y=\"132\" width=\"3\" height=\"12\" fill=\"#111417\"/>"
			+ "<rect x=\"110\" y=\"26\" width=\"202\" height=\"70\" fill=\"#ffffff\" stroke=\"#111417\" stroke-width=\"1.2\"/>"
			+ "<rect x=\"110\" y=\"26\" width=\"202\" height=\"14\" fill=\"#111417\"/>"
			+ "<rect x=\"114\" y=\"30\" width=\"6\" height=\"6\" fill=\"#f7b500\"/>"
			+ "<text x=\"126\" y=\"36\" font-family=\"monospace\" font-size=\"7\" letter-spacing=\".2em\" fill=\"#e9edf0\">TRANSCRIPT</text>"
			+ "<g fill=\"#525a64\"><rect x=\"120\" y=\"50\" width=\"180\" height=\"3\"/><rect x=\"120\" y=\"58\" width=\"150\" height=\"3\"/><rect x=\"120\" y=\"66\" width=\"168\" height=\"3\"/><rect x=\"120\" y=\"74\" width=\"96\" height=\"3\"/></g>"
			+ "<rect x=\"196\" y=\"84\" width=\"108\" height=\"12\" fill=\"#f7b500\" stroke=\"#111417\"/>"
			+ "<rect x=\"110\" y=\"104\" width=\"202\" height=\"50\" fill=\"#ffffff\" stroke=\"#111417\" stroke-width=\"1.2\"/>"
			+ "<rect x=\"110\" y=\"104\" width=\"3\" height=\"50\" fill=\"#111417\"/>"
			+ "<g fill=\"#8b939d\"><rect x=\"122\" y=\"114\" width=\"120\" height=\"3\"/><rect x=\"122\" y=\"124\" width=\"160\" height=\"3\"/><rect x=\"122\" y=\"134\" width=\"90\" height=\"3\"/></g>"
			+ "<rect x=\"110\" y=\"158\" width=\"202\" height=\"0\" fill=\"#ffffff\"/>"
			+ "</svg>";
		//#endregion

		//#region 两套底 + 强调色 + 圆角档
		/** 纸面（亮）：近白纸 + 黑色发丝线 + 实心黑块 */
		var PAPER = {
			scheme: "light",
			sheet: "#e9ebee", base: "#f4f5f7", panel: "#ffffff", panel2: "#ffffff", platform: "#eef0f3",
			solid: "#111417", solidInk: "#f4f5f7",
			ink: ["#111417", "#525a64", "#8b939d", "#a9b0b8"],
			hair: "17,20,23",
			ok: "#1d6f47", bad: "#b5342a", info: "#25567f",
			code: { prop: "#1d3f63", val: "#7a4b12", num: "#b5342a", com: "#7d8a76" },
			diff: { addBg: "rgba(29,111,71,.10)", addInk: "#175c3a", delBg: "rgba(181,52,42,.09)", delInk: "#8d2a22" },
			lift: "3px 3px 0 rgba(17,20,23,.16)",
			texture: 0.05,
		};
		/** 终端（暗）：近黑面板 + 冷白发丝线 + 反相实心块 */
		var TERMINAL = {
			scheme: "dark",
			sheet: "#080a0c", base: "#0d1012", panel: "#121618", panel2: "#171c1f", platform: "#101417",
			solid: "#e9edf0", solidInk: "#0d1012",
			ink: ["#e9edf0", "#98a3ab", "#67717a", "#4d565e"],
			hair: "233,237,240",
			ok: "#4fbf85", bad: "#e2705f", info: "#6aa9dd",
			code: { prop: "#8ab7ea", val: "#e0a45c", num: "#ff9a8a", com: "#7f8f7a" },
			diff: { addBg: "rgba(79,191,133,.13)", addInk: "#8fd8ae", delBg: "rgba(226,112,95,.12)", delInk: "#f0a396" },
			lift: "3px 3px 0 rgba(0,0,0,.55)",
			texture: 0.045,
		};
		var MODES = { paper: PAPER, terminal: TERMINAL };
		/** —— 浅底可读性工具：同色相压暗到与背景达到目标对比度（亮黄/亮青在白底上 <2:1，不能当文字）—— */
		/** 容忍两种写法：hex（#ffffff）与宿主风格的 "r,g,b"。 */
		function sknRgb(value) {
			var s = String(value).replace("#", "");
			if (s.indexOf(",") >= 0) {
				var t = s.split(",");
				return [Number(t[0]), Number(t[1]), Number(t[2])];
			}
			var h = s;
			if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
			return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
		}
		function sknHex(rgb) {
			return "#" + rgb.map(function (v) {
				var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
				return s.length === 1 ? "0" + s : s;
			}).join("");
		}
		function sknLum(rgb) {
			var c = rgb.map(function (v) {
				var x = v / 255;
				return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
			});
			return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
		}
		function sknRatio(a, b) {
			var la = sknLum(sknRgb(a)), lb = sknLum(sknRgb(b));
			var hi = Math.max(la, lb), lo = Math.min(la, lb);
			return (hi + 0.05) / (lo + 0.05);
		}
		function sknInkSafe(hex, bgHex, target) {
			var rgb = sknRgb(hex);
			for (var k = 0; k < 64 && sknRatio(sknHex(rgb), bgHex) < target; k++) {
				rgb = [rgb[0] * 0.93, rgb[1] * 0.93, rgb[2] * 0.93];
			}
			return sknHex(rgb);
		}
		/** 背景够亮 → 用压暗的同色相（亮黄/亮青在白底上 <2:1 不能当文字）；背景够暗 → 保持原色。 */
		function sknOnSurface(accent, surface, target) {
			return sknLum(sknRgb(surface)) > 0.5 ? sknInkSafe(accent, surface, target || 4.5) : accent;
		}

		var ACCENTS = {
			yellow: { label: "警示黄（RAL 1003）", c: "#f7b500", hi: "#ffd75e", lo: "#b98a00", rgb: "247,181,0", ink: "#111417" },
			safety: { label: "安全黄（亮档）", c: "#f7b500", hi: "#ffe066", lo: "#c9a400", rgb: "255,209,0", ink: "#111417" },
			orange: { label: "工程橙", c: "#ff8a1f", hi: "#ffb066", lo: "#c96a10", rgb: "255,138,31", ink: "#111417" },
			cyan: { label: "信号青", c: "#2ecfd0", hi: "#7ee6e6", lo: "#1d9c9d", rgb: "46,207,208", ink: "#08201f" },
		};
		var RADII = {
			square: { label: "直角", base: 0 },
			bench: { label: "工作台", base: 6 },
			round: { label: "圆润", base: 12 },
		};
		var DEFAULTS = { enabled: true, appearance: "follow", radius: "square", accent: "yellow", texture: true, lift: true, din: true };
		//#endregion

		//#region 颜色工具
		function hexRgb(hex) {
			var h = String(hex).replace("#", "");
			var f = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
			var n = parseInt(f, 16);
			return ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255);
		}
		function rgba(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
		function hexA(hex, a) { return "rgba(" + hexRgb(hex) + "," + a + ")"; }
		//#endregion

		//#region 宿主主题探测（跟随应用的亮暗）
		function systemPrefersDark() {
			try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (error) { return true; }
		}
		/** 应用主题偏好 → 有效底：'paper' | 'terminal' */
		function resolveMode(ctx, settings) {
			if (settings.appearance === "paper") return "paper";
			if (settings.appearance === "terminal") return "terminal";
			var pref = "";
			try {
				var snap = ctx.theme && ctx.theme.getTheme ? ctx.theme.getTheme() : null;
				pref = snap && typeof snap.preference === "string" ? snap.preference : "";
			} catch (error) { pref = ""; }
			if (pref === "light") return "paper";
			if (pref === "dark") return "terminal";
			return systemPrefersDark() ? "terminal" : "paper";
		}
		//#endregion

		//#region token 表（PRTS 全部实心）
		function tokenTable(m, a, r, opts) {
			var hair = m.hair, solid = m.solid, ink = m.ink, lift = opts.lift;
			var radius = r.base;
			var rad = function (d) { return Math.max(0, radius + d) + "px"; };
			var fontUi = opts.din
				? 'Bahnschrift,"Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI","Microsoft YaHei",sans-serif'
				: '"Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI","Microsoft YaHei",sans-serif';
			return {
				// ---- 表面：PRTS 不留玻璃，全部实心 ----
				"--dsw-alias-bg-base": m.base,
				"--dsw-alias-bg-layer-1": m.panel,
				"--dsw-alias-bg-layer-2": m.panel2,
				"--dsw-alias-bg-layer-3": m.panel2,
				"--dsw-alias-bg-overlay": m.panel2,
				"--dsw-alias-bg-module-platform": m.platform,
				"--dsw-alias-bg-multi-select": rgba(a.rgb, 0.14),
				"--dsw-alias-bg-skeleton": rgba(hair, 0.06),
				"--dsw-alias-bg-mask-1": "rgba(0,0,0,.18)",
				"--dsw-alias-bg-mask-2": "rgba(0,0,0,.10)",
				"--dsw-alias-bg-mask-3": m.scheme === "dark" ? "rgba(0,0,0,.58)" : "rgba(0,0,0,.42)",
				"--dsw-alias-bg-document-preview": m.platform,
				"--dsw-alias-bg-document-selection": rgba(a.rgb, 0.3),
				// ---- 边界：黑色发丝线（PRTS 的层级全靠它）----
				"--dsw-alias-border-l1": rgba(hair, 0.18),
				"--dsw-alias-border-l2": rgba(hair, 0.3),
				"--dsw-alias-border-l3": rgba(hair, 0.45),
				"--dsw-alias-border-l4": rgba(hair, 0.6),
				"--dsw-alias-border-l2-darkmode-thin": rgba(hair, 0.26),
				"--dsw-alias-border-inverted": rgba(hair, 0.5),
				"--dsw-alias-border-inverted2": rgba(hair, 0.3),
				"--dsw-alias-settings-card-fill": rgba(hair, 0.035),
				"--dsw-alias-settings-card-stroke": rgba(hair, 0.22),
				// ---- 文字与品牌 ----
				"--dsw-alias-label-primary": ink[0],
				"--dsw-alias-label-primary-foreground": a.ink,
				"--dsw-alias-label-primary-inverted": m.base,
				"--dsw-alias-label-primary-bluish": ink[0],
				"--dsw-alias-label-primary-dimmed": rgba(hexRgb(ink[0]), 0.62),
				"--dsw-alias-label-secondary": ink[1],
				"--dsw-alias-label-tertiary": ink[2],
				"--dsw-alias-label-caption": ink[3],
				"--dsw-alias-label-dimmed": ink[2],
				"--dsw-alias-label-deep-diving": sknOnSurface(a.c, m.panel, 4.5),
				"--dsw-alias-brand-primary": sknOnSurface(a.c, m.panel, 4.5),
				"--dsw-alias-brand-primary-invert": a.ink,
				"--dsw-alias-brand-text": a.ink,
				"--dsw-alias-link": m.info,
				// ---- 交互面 ----
				"--dsw-alias-interactive-bg-hover": rgba(hair, 0.07),
				"--dsw-alias-interactive-bg-active": rgba(hair, 0.12),
				"--dsw-alias-interactive-bg-hover-accent": rgba(a.rgb, 0.2),
				"--dsw-alias-interactive-bg-hover-danger": hexA(m.bad, 0.14),
				"--dsw-alias-interactive-bg-hover-solid": rgba(hair, 0.09),
				// ---- 按钮 ----
				"--dsw-alias-button-primary-fill": a.c,
				"--dsw-alias-button-primary-hover": a.hi,
				"--dsw-alias-button-primary-dimmed": rgba(a.rgb, 0.45),
				"--dsw-alias-button-elevated-fill": m.panel,
				"--dsw-alias-button-floating-fill": m.panel2,
				"--dsw-alias-button-floating-hover": m.panel,
				"--dsw-alias-button-ghost-active-fill": rgba(hair, 0.09),
				"--dsw-alias-button-ghost-active-border": rgba(hair, 0.55),
				"--dsw-alias-button-ghost-active-hover": rgba(hair, 0.13),
				"--dsw-alias-button-info-fill": a.c,
				"--dsw-alias-button-info-hover": a.hi,
				"--dsw-alias-button-tool-bar-fill": rgba(hair, 0.05),
				"--dsw-alias-button-tool-bar-fill-invisible": "transparent",
				"--dsw-alias-button-tool-bar-hover": rgba(hair, 0.1),
				"--dsw-alias-button-contrast-fill": solid,
				// ---- 状态语义（PRTS：成功/危险保持独立色相）----
				"--dsw-alias-state-success-primary": m.ok,
				"--dsw-alias-state-success-secondary": hexA(m.ok, 0.5),
				"--dsw-alias-state-success-tertiary": hexA(m.ok, 0.16),
				"--dsw-alias-state-error-primary": m.bad,
				"--dsw-alias-state-error-secondary": hexA(m.bad, 0.5),
				"--dsw-alias-state-warn-primary": m.scheme === "dark" ? "#e6b64c" : "#8a6a00",
				"--dsw-alias-state-warn-secondary": m.scheme === "dark" ? "#e6b64c80" : "#8a6a0080",
				"--dsw-alias-state-warn-tertiary": m.scheme === "dark" ? "#e6b64c26" : "#8a6a0020",
				"--dsw-alias-state-warn-label": m.scheme === "dark" ? "#e6b64c" : "#7a5e00",
				"--dsw-alias-state-business-primary": m.info,
				"--dsw-alias-state-business-tertiary": hexA(m.info, 0.16),
				"--dsw-alias-state-idle-primary": ink[2],
				// ---- 代码与 diff ----
				"--dsw-alias-code-diff-added": m.diff.addBg,
				"--dsw-alias-code-diff-deleted": m.diff.delBg,
				"--dsw-alias-file-diff-added-bg": m.diff.addBg,
				"--dsw-alias-file-diff-added-gutter": hexA(m.ok, 0.3),
				"--dsw-alias-file-diff-added-marker": m.ok,
				"--dsw-alias-file-diff-deleted-bg": m.diff.delBg,
				"--dsw-alias-file-diff-deleted-gutter": hexA(m.bad, 0.3),
				"--dsw-alias-file-diff-deleted-marker": m.bad,
				// ---- Markdown ----
				"--dsw-alias-markdown-code-block": m.scheme === "dark" ? rgba("3,5,9", 0.6) : rgba(hair, 0.05),
				"--dsw-alias-markdown-code-block-banner": rgba(hair, 0.05),
				"--dsw-alias-markdown-inline-code": rgba(a.rgb, 0.18),
				"--dsw-alias-markdown-tag": rgba(a.rgb, 0.22),
				"--dsw-alias-markdown-citation": m.info,
				"--dsw-alias-markdown-placeholder": ink[3],
				"--dsw-alias-markdown-code-segment-selected": rgba(a.rgb, 0.25),
				"--dsw-alias-markdown-code-segment-unselected": rgba(hair, 0.08),
				// ---- 菜单 / 提示 / 开关 ----
				"--dsw-alias-menu-group-header-fill": rgba(hair, 0.05),
				"--dsw-alias-menu-icon": ink[1],
				"--dsw-alias-tooltip-bg": m.panel2,
				"--dsw-alias-tooltip-key-bg": rgba(hair, 0.1),
				"--dsw-alias-toast-bg": m.panel2,
				"--dsw-alias-toast-label": ink[0],
				"--dsw-alias-switch-thumb": ink[0],
				"--dsw-alias-turn-trigger-bg": rgba(hair, 0.06),
				"--dsw-alias-turn-trigger-bg-hover": rgba(hair, 0.11),
				"--dsw-alias-onboarding-accent": a.c,
				"--dsw-alias-onboarding-card-fill": m.panel,
				"--dsw-alias-onboarding-secondary-fill": rgba(hair, 0.06),
				"--dsw-alias-onboarding-checkbox-border": rgba(hair, 0.4),
				// ---- 滚动条（PRTS：方头细条）----
				"--dsw-alias-scrollbar-bg-l1": rgba(hair, 0.18),
				"--dsw-alias-scrollbar-bg-l2": rgba(hair, 0.26),
				"--dsw-alias-scrollbar-hover-l1": rgba(a.rgb, 0.75),
				"--dsw-alias-scrollbar-hover-l2": a.c,
				// ---- 宿主 specific 层表面（不覆盖就会留着宿主的 scheme 值）----
				"--dsw-specific-input-major": m.panel,
				"--dsw-specific-selector": m.platform,
				"--dsw-specific-tip": m.scheme === "dark" ? rgba(a.rgb, 0.12) : rgba(a.rgb, 0.18),
				"--dsw-specific-bubble": m.scheme === "dark" ? m.platform : hexA(a.c, 0.14),
				"--dsw-specific-bubble-highlight": hexA(a.c, 0.26),
				"--dsw-specific-menu": m.panel2,
				"--dsw-specific-login-input": m.platform,
				"--dsw-menu-surface-fill": m.panel2,
				// 思考条的线性渐变（宿主默认是写死的白）
				"--dsw-linear-gradient-think": "linear-gradient(180deg, " + m.panel + " 20.19%, " + hexA(m.panel, 0) + " 100%)",
				"--dsw-linear-think-select": "linear-gradient(180deg, " + m.platform + " 20.19%, " + hexA(m.platform, 0) + " 100%)",
				// ---- 侧栏（宿主 specific 层）----
				"--dsw-specific-sidebar-fill": m.panel,
				"--dsw-specific-sidebar-nav-item-active": rgba(a.rgb, 0.24),
				"--dsw-specific-sidebar-nav-item-hover": rgba(hair, 0.08),
				"--dsw-specific-sidebar-nav-item-active-accent": a.c,
				// ---- 圆角：PRTS 直角（可切工作台/圆润）----
				"--dsw-radius-xs": rad(-2),
				"--dsw-radius-sm": rad(0),
				"--dsw-radius-md": rad(0),
				"--dsw-radius-lg": rad(2),
				"--dsw-radius-xl": rad(4),
				"--dsw-radius-panel": rad(6),
				// ---- 字体：DIN 技术字（中文回落雅黑）----
				"--dsw-font-family": fontUi,
				"--ds-font-family-code": 'Consolas,"Cascadia Mono","Microsoft YaHei UI",monospace',
				// ---- 静态色阶跟随强调色 ----
				"--dsw-static-blue-50": hexA(a.c, 0.1),
				"--dsw-static-blue-100": hexA(a.c, 0.18),
				"--dsw-static-blue-300": hexA(a.c, 0.4),
				"--dsw-static-blue-400": hexA(a.c, 0.65),
				"--dsw-static-blue-450": a.c,
				"--dsw-static-blue-500": a.c,
				"--dsw-static-blue-600": sknOnSurface(a.c, m.panel, 4.5),
				"--dsw-static-blue-800": sknOnSurface(a.lo, m.panel, 4.5),
				"--dsw-static-blue-900": a.ink,
				"--dsw-static-deepseek-100": hexA(a.c, 0.18),
				"--dsw-static-deepseek-200": hexA(a.c, 0.26),
				"--dsw-static-deepseek-300": hexA(a.c, 0.4),
				"--dsw-static-deepseek-400": hexA(a.c, 0.65),
				"--dsw-static-deepseek-450": a.c,
				"--dsw-static-deepseek-500": a.c,
				"--dsw-static-deepseek-600": sknOnSurface(a.c, m.panel, 4.5),
				"--dsw-static-deepseek-800": sknOnSurface(a.lo, m.panel, 4.5),
				"--dsw-static-deepseek-900": a.ink,
				// ---- 中性灰阶重映射（宿主大量组件直读）----
				"--dsw-static-neutral-bluish-1000": m.scheme === "dark" ? "#080a0c" : "#0f1113",
				"--dsw-static-neutral-bluish-950": m.scheme === "dark" ? "#0b0e10" : "#161a1d",
				"--dsw-static-neutral-bluish-900": m.scheme === "dark" ? m.base : "#1d2126",
				"--dsw-static-neutral-bluish-875": m.scheme === "dark" ? "#101418" : "#252a30",
				"--dsw-static-neutral-bluish-850": m.scheme === "dark" ? "#12161a" : "#2c3238",
				"--dsw-static-neutral-bluish-800": m.scheme === "dark" ? m.panel : "#343a41",
				"--dsw-static-neutral-bluish-750": m.scheme === "dark" ? "#1a1f23" : "#454b53",
				"--dsw-static-neutral-bluish-700": m.scheme === "dark" ? "#2a3036" : "#5b626a",
				"--dsw-static-neutral-bluish-600": m.scheme === "dark" ? "#4a5259" : "#767d86",
				"--dsw-static-neutral-bluish-500": m.scheme === "dark" ? "#67717a" : "#8b939d",
				"--dsw-static-neutral-bluish-400": m.scheme === "dark" ? "#98a3ab" : "#a3aab3",
				"--dsw-static-neutral-bluish-300": m.scheme === "dark" ? "#c3cad0" : "#c3c9cf",
				"--dsw-static-neutral-bluish-200": m.scheme === "dark" ? "#dfe4e8" : "#dde1e5",
				"--dsw-static-neutral-bluish-150": m.scheme === "dark" ? "#e9edf0" : "#e8ebee",
				"--dsw-static-neutral-bluish-100": m.scheme === "dark" ? "#eef2f4" : "#eef0f3",
				"--dsw-static-neutral-bluish-75": m.scheme === "dark" ? "#f4f7f8" : "#f3f5f6",
				"--dsw-static-neutral-bluish-60": m.scheme === "dark" ? "#f7f9fa" : "#f6f7f8",
				"--dsw-static-neutral-bluish-50": m.scheme === "dark" ? "#fafcfc" : "#f9fafb",
				"--dsw-static-neutral-bluish-00": "#ffffff",
			};
		}
		//#endregion

		//#region 样式表
		function hostCss(m, a, opts) {
			var s = "body[" + BODY_ATTR + "]";
			var rules = [
				// 全局：直角 + 发丝线 + 等宽数字
				s + "{color-scheme:" + m.scheme + ";-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}",
				s + " ::selection{background:" + rgba(a.rgb, 0.35) + ";color:" + a.ink + "}",
				// 语义浮层：实心 + 硬投影（PRTS 的"浮窗"感）；用标准语义属性，不碰宿主私有类名
				s + ' [role="dialog"],' + s + ' [aria-modal="true"],' + s + ' [role="menu"],' + s + ' [role="listbox"],' + s + ' [role="tooltip"]'
					+ "{background-color:" + m.panel2 + "!important;border-radius:" + Math.max(0, opts.radiusBase) + "px}",
				// 方头滚动条
				s + " ::-webkit-scrollbar{width:11px;height:11px}",
				s + " ::-webkit-scrollbar-track{background:" + rgba(m.hair, 0.06) + "}",
				s + " ::-webkit-scrollbar-thumb{background:" + rgba(m.hair, 0.28) + ";border:2px solid transparent;background-clip:padding-box}",
				s + " ::-webkit-scrollbar-thumb:hover{background:" + a.c + ";background-clip:padding-box}",
				s + " ::-webkit-scrollbar-corner{background:transparent}",
				// 焦点环：警示黄细框（替掉默认蓝环）
				s + " :focus-visible{outline:2px solid " + a.c + ";outline-offset:1px}",
			];
			if (opts.lift) {
				rules.push(
					s + ' [role="dialog"],' + s + ' [aria-modal="true"],' + s + ' [role="menu"],' + s + ' [role="listbox"]'
						+ "{box-shadow:" + m.lift + "!important}",
					// 按压反馈：整体位移 1px（AK 的实体键手感）
					s + " button:active," + s + ' [role="button"]:active{transform:translate(1px,1px)}'
				);
			}
			return rules.join("");
		}

		function chromeCss(m, a, opts) {
			var c = "[" + CHROME_ATTR + "]";
			var rules = [
				c + "{position:fixed;inset:0;pointer-events:none;z-index:1}",
			];
			if (opts.texture) {
				var gridA = m.texture.toFixed(3);
				var scanA = (m.texture * 0.9).toFixed(3);
				rules.push(
					c + " ." + CSS_PREFIX + "-grid{position:absolute;inset:0;background-image:"
						+ "linear-gradient(90deg," + rgba(m.hair, gridA) + " 1px,transparent 1px),"
						+ "linear-gradient(0deg," + rgba(m.hair, gridA) + " 1px,transparent 1px),"
						+ "linear-gradient(90deg," + rgba(m.hair, (gridA * 1.8).toFixed(3)) + " 1px,transparent 1px),"
						+ "linear-gradient(0deg," + rgba(m.hair, (gridA * 1.8).toFixed(3)) + " 1px,transparent 1px);"
						+ "background-size:16px 16px,16px 16px,160px 160px,160px 160px}",
					c + " ." + CSS_PREFIX + "-scan{position:absolute;inset:0;opacity:.6;"
						+ "background-image:repeating-linear-gradient(0deg," + rgba(m.hair, scanA) + " 0 1px,transparent 1px 3px)}"
				);
			}
			rules.push(
				// 四角登记标记
				c + " ." + CSS_PREFIX + "-mark{position:absolute;width:20px;height:20px}",
				c + " ." + CSS_PREFIX + "-mark::before," + c + " ." + CSS_PREFIX + "-mark::after{content:\"\";position:absolute;background:" + rgba(m.hair, 0.55) + "}",
				c + " ." + CSS_PREFIX + "-mark::before{left:50%;top:0;width:1px;height:100%}",
				c + " ." + CSS_PREFIX + "-mark::after{top:50%;left:0;height:1px;width:100%}",
				c + " ." + CSS_PREFIX + "-mark.tl{left:12px;top:12px}",
				c + " ." + CSS_PREFIX + "-mark.tr{right:12px;top:12px}",
				c + " ." + CSS_PREFIX + "-mark.bl{left:12px;bottom:12px}",
				c + " ." + CSS_PREFIX + "-mark.br{right:12px;bottom:12px}",
				// 左缘警示条（黄黑斜纹，设备边缘感）
				c + " ." + CSS_PREFIX + "-edge{position:absolute;left:0;top:0;bottom:0;width:3px;"
					+ "background:repeating-linear-gradient(180deg," + a.c + " 0 7px," + m.solid + " 7px 14px);opacity:.9}"
			);
			return rules.join("");
		}

		function sectionCss(m, a) {
			var w = "[data-" + SECTION_ID + "]";
			return [
				w + "{display:flex;flex-direction:column;gap:10px;max-width:620px}",
				w + " h3{margin:0;font-size:15px;font-weight:600;color:" + m.ink[0] + "}",
				w + " p{margin:0;font-size:12px;line-height:1.6;color:" + m.ink[2] + "}",
				w + " ." + CSS_PREFIX + "-row{display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid " + rgba(m.hair, 0.18) + "}",
				w + " ." + CSS_PREFIX + "-rowText{flex:1;min-width:0}",
				w + " ." + CSS_PREFIX + "-label{font-size:13px;color:" + m.ink[0] + "}",
				w + " ." + CSS_PREFIX + "-desc{font-size:11px;line-height:1.5;color:" + m.ink[2] + ";margin-top:2px}",
				w + " select{min-width:104px;padding:6px 10px;border-radius:0;font-size:13px;color:" + m.ink[0] + ";background:" + m.panel + ";border:1px solid " + rgba(m.hair, 0.4) + ";outline:none}",
				w + " select:focus{border-color:" + a.c + ";box-shadow:2px 2px 0 " + rgba(m.hair, 0.18) + "}",
				w + " input[type=checkbox]{width:18px;height:18px;accent-color:" + a.c + "}",
				w + " ." + CSS_PREFIX + "-actions{display:flex;gap:8px;padding-top:4px}",
				w + " button{padding:7px 14px;border-radius:0;font-size:13px;cursor:pointer;color:" + m.ink[0] + ";background:" + m.panel + ";border:1px solid " + rgba(m.hair, 0.4) + "}",
				w + " button:hover{background:" + a.c + ";color:" + a.ink + ";border-color:" + rgba(m.hair, 0.6) + "}",
			].join("");
		}

		function buildCss(m, a, r, opts) {
			var table = tokenTable(m, a, r, opts);
			var decls = Object.keys(table).map(function (name) { return name + ":" + table[name] + "!important"; }).join(";");
			return [
				"/* " + SKIN_NAME + " — injected by activate(), removed by deactivate() */",
				"body[" + BODY_ATTR + "]{" + decls + ";background-color:" + m.base + "}",
				hostCss(m, a, opts),
				chromeCss(m, a, opts),
				sectionCss(m, a),
			].join("\n");
		}
		//#endregion

		//#region 设置存储
		function normalize(raw) {
			var src = raw && typeof raw === "object" ? raw : {};
			var pick = function (table, key, fallback) { return Object.prototype.hasOwnProperty.call(table, key) ? key : fallback; };
			return {
				appearance: ["follow", "paper", "terminal"].indexOf(src.appearance) >= 0 ? src.appearance : DEFAULTS.appearance,
				radius: pick(RADII, src.radius, DEFAULTS.radius),
				accent: pick(ACCENTS, src.accent, DEFAULTS.accent),
				texture: src.texture === undefined ? DEFAULTS.texture : src.texture === true,
				lift: src.lift === undefined ? DEFAULTS.lift : src.lift === true,
				din: src.din === undefined ? DEFAULTS.din : src.din === true,
				enabled: src.enabled === undefined ? DEFAULTS.enabled : src.enabled === true,
			};
		}
		function readSettings() {
			try {
				var raw = window.localStorage.getItem(STORAGE_KEY);
				return normalize(raw ? JSON.parse(raw) : null);
			} catch (error) { return normalize(null); }
		}
		var listeners = [];
		function emit() { listeners.slice().forEach(function (fn) { try { fn(); } catch (error) { /* 单个监听者出错不影响其它 */ } }); }
		function writeSettings(patch) {
			var next = normalize(Object.assign({}, readSettings(), patch));
			try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (error) { /* 隐私模式：内存值仍生效 */ }
			emit();
			return next;
		}
		function subscribe(fn) {
			listeners.push(fn);
			return function () { listeners = listeners.filter(function (item) { return item !== fn; }); };
		}
		//#endregion

		//#region 装饰层（自有节点，可整体移除）
		function mountChrome(dom, onCleanup) {
			var root = dom.createElement("div");
			root.setAttribute(CHROME_ATTR, "");
			root.setAttribute("aria-hidden", "true");
			var grid = dom.createElement("div");
			grid.className = CSS_PREFIX + "-grid";
			var scan = dom.createElement("div");
			scan.className = CSS_PREFIX + "-scan";
			var edge = dom.createElement("div");
			edge.className = CSS_PREFIX + "-edge";
			root.appendChild(grid);
			root.appendChild(scan);
			root.appendChild(edge);
			["tl", "tr", "bl", "br"].forEach(function (corner) {
				var mark = dom.createElement("span");
				mark.className = CSS_PREFIX + "-mark " + corner;
				root.appendChild(mark);
			});
			dom.body.appendChild(root);
			onCleanup(function () { root.remove(); });
			return root;
		}
		//#endregion

		/** 注册 locale + 「设置 → <皮肤>」席位（两种模式共用，立即执行并返回拆卸函数）。 */
		function registerSection(ctx, standalone) {
			var disposeLocale = ctx.locale.register(LOCALE_NS, LOCALE_DICTS);
			var t = ctx.locale.bind(LOCALE_NS);
			var disposeSeat = ctx.slots.inject("settings.section", function () {
				return ctx.slots.register(
					{ name: "settings.section", id: SECTION_ID, order: 93, label: function () { return t("nav.label"); } },
					createAppearanceSection(t, standalone));
			});
			return function () {
				try { disposeSeat(); } catch (error) { /* 忽略 */ }
				try { disposeLocale(); } catch (error) { /* 忽略 */ }
			};
		}

		//#region 激活会话
		/** theme.register 对重复 id 会抛错。上一次 activate 若没清理干净，
		 *  这里换一个带序号的 id 兜底，避免整次激活被宿主回滚成 default。 */
		var themeSeq = 0;
		function registerThemeSafe(ctx, def) {
			try {
				return ctx.theme.register(def);
			} catch (error) {
				themeSeq += 1;
				return ctx.theme.register(Object.assign({}, def, { id: def.id + "-" + themeSeq }));
			}
		}


		function createActivation(ctx) {
			var session = null;
			function activate(skinCtx) {
				if (session !== null) session.teardown();
				session = start(ctx, skinCtx);
			}
			function deactivate() {
				if (session !== null) { session.teardown(); session = null; }
			}
			ctx.effect(function () { return function () { deactivate(); }; }, "skn-prts: session safety net");
			return { activate: activate, deactivate: deactivate, isActive: function () { return session !== null; } };
		}

		function start(ctx, skinCtx) {
			var dom = document;
			var torn = false;
			var disposers = [];
			var settings = readSettings();
			var mode = resolveMode(ctx, settings);
			var currentThemeDispose = null;

			skinCtx.logger.info("prts: activating", { skin: SKIN_ID, mode: mode, settings: settings });
			dom.body.setAttribute(BODY_ATTR, "");

			// 宿主的亮暗开关是 body[data-ds-dark-theme]：皮肤必须驱动它，
			// 否则 --dsw-specific-* 这类"只在 scheme 分支里有定义"的表面会留在错误的一档。
			// 宿主自己也会重写它（跟随系统/切亮暗时），所以要盯着并复位到当前有效底。
			var hadDarkAttr = dom.body.hasAttribute("data-ds-dark-theme");
			function applyHostScheme(nextMode) {
				if (nextMode === "terminal") dom.body.setAttribute("data-ds-dark-theme", "");
				else dom.body.removeAttribute("data-ds-dark-theme");
			}
			var schemeGuard = new MutationObserver(function () {
				var want = mode === "terminal";
				var has = dom.body.hasAttribute("data-ds-dark-theme");
				if (want && !has) dom.body.setAttribute("data-ds-dark-theme", "");
				else if (!want && has) dom.body.removeAttribute("data-ds-dark-theme");
			});
			schemeGuard.observe(dom.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
			disposers.push(function () { schemeGuard.disconnect(); });

			var styleNode = dom.createElement("style");
			styleNode.setAttribute(STYLE_ATTR, "");

			/** 提交主题注册 + token 覆盖 + 样式表（模式变化时整体重算）。 */
			function apply(nextMode, nextSettings) {
				var m = MODES[nextMode];
				var a = ACCENTS[nextSettings.accent];
				var r = RADII[nextSettings.radius];
				var opts = {
					texture: nextSettings.texture,
					lift: nextSettings.lift,
					din: nextSettings.din,
					radiusBase: r.base,
				};
				var table = tokenTable(m, a, r, opts);
				var overrides = {};
				Object.keys(table).forEach(function (name) {
					overrides[name] = { light: table[name], dark: table[name] };
				});
				ctx.theme.overrideTokens(SKIN_ID, overrides);
				styleNode.textContent = buildCss(m, a, r, opts);
				applyHostScheme(nextMode);
				// 主题注册（colorScheme 跟随有效底）；重复 id 会抛错，所以先撤旧的
				if (currentThemeDispose !== null) { currentThemeDispose(); currentThemeDispose = null; }
				currentThemeDispose = registerThemeSafe(ctx, {
					id: THEME_ID,
					colorScheme: m.scheme,
					tokens: table,
				});
				dom.documentElement.setAttribute(BODY_ATTR + "-mode", nextMode);
			}

			try {
				dom.head.appendChild(styleNode);
				disposers.push(function () { styleNode.remove(); });
				apply(mode, settings);
				mountChrome(dom, function (dispose) { disposers.push(dispose); });
			} catch (error) {
				dom.body.removeAttribute(BODY_ATTR);
				throw error;
			}

			// 设置变化 → 立即重算
			disposers.push(subscribe(function () {
				if (torn) return;
				settings = readSettings();
				mode = resolveMode(ctx, settings);
				try { apply(mode, settings); } catch (error) { skinCtx.logger.warn("prts: apply failed", { error: String(error) }); }
				skinCtx.logger.debug("prts: appearance updated", { mode: mode, settings: settings });
			}));

			// 跨标签页 / 其它面板写入（storage 事件不在本写入方触发，走 subscribe）
			var onStorage = function (event) { if (event.key === STORAGE_KEY) emit(); };
			window.addEventListener("storage", onStorage);
			disposers.push(function () { window.removeEventListener("storage", onStorage); });

			// 跟随应用主题：1s 轮询 + 系统配色变化事件
			var poll = window.setInterval(function () {
				if (torn) return;
				var next = resolveMode(ctx, readSettings());
				if (next !== mode) {
					mode = next;
					try { apply(mode, settings); } catch (error) { skinCtx.logger.warn("prts: mode switch failed", { error: String(error) }); }
				}
			}, 1000);
			disposers.push(function () { window.clearInterval(poll); });
			var mq = null;
			try {
				mq = window.matchMedia("(prefers-color-scheme: dark)");
				var onMq = function () { emit(); };
				mq.addEventListener("change", onMq);
				disposers.push(function () { mq.removeEventListener("change", onMq); });
			} catch (error) { /* 老引擎：轮询已覆盖 */ }

			// 4) locale + 设置席位（自立模式下由 apply 层注册，避免"关掉就再也开不回来"）
			var t = ctx.locale.bind(LOCALE_NS);
			if (skinCtx.standalone !== true) {
				disposers.push(registerSection(ctx, false));
			}

			var onAbort = function () { teardown(); };
			skinCtx.signal.addEventListener("abort", onAbort);

			function teardown() {
				if (torn) return;
				torn = true;
				skinCtx.signal.removeEventListener("abort", onAbort);
				for (var i = disposers.length - 1; i >= 0; i--) {
					try { disposers[i](); } catch (error) { skinCtx.logger.warn("prts: teardown step failed", { error: String(error) }); }
				}
				if (currentThemeDispose !== null) { try { currentThemeDispose(); } catch (error) { /* 忽略 */ } currentThemeDispose = null; }
				// 还原宿主的亮暗开关（原本有就留空属性，原本没有就摘掉）
				if (hadDarkAttr) dom.body.setAttribute("data-ds-dark-theme", "");
				else dom.body.removeAttribute("data-ds-dark-theme");
				dom.documentElement.removeAttribute(BODY_ATTR + "-mode");
				dom.body.removeAttribute(BODY_ATTR);
				skinCtx.logger.info("prts: deactivated — all side effects unwound");
			}
			return { teardown: teardown };
		}
		//#endregion

		//#region 设置面板
		var LOCALE_DICTS = {
			zh: {
				"nav.label": "PRTS",
				"settings.title": "PRTS",
				"settings.desc": "罗德岛终端风格：直角切角 + 黑色发丝线 + 警示黄。表面是实心的（弹窗不会透出正文），亮/暗两套底可跟随应用主题。",
				"settings.appearance": "外观",
				"settings.appearance.desc": "跟随应用主题，或强制纸面（亮）/ 终端（暗）。",
				"settings.accent": "强调色",
				"settings.accent.desc": "只给「当前 / 可点 / 运行中 / 焦点」用。",
				"settings.radius": "圆角",
				"settings.radius.desc": "PRTS 是直角；工作台/圆润是给不习惯全直角的人留的退路。",
				"settings.texture": "纹理",
				"settings.texture.desc": "覆盖全屏的细网格 + 扫描线 + 四角登记标记。",
				"settings.lift": "硬投影",
				"settings.lift.desc": "浮窗错位实心影 + 按钮按压位移（AK 的\"贴纸浮起\"手感）。",
				"settings.din": "DIN 技术字",
				"settings.din.desc": "拉丁文用 Bahnschrift（DIN 风格），中文仍回落雅黑。",
				"settings.skin": "皮肤",
				"settings.skin.desc": "第一项「原生」就是还原默认皮肤；其余是控制台里已登记的皮肤，选哪款就切哪款。",
				"settings.skin.native": "原生（默认观感）",
				"settings.skin.this": "本皮肤（PRTS）",

				"settings.reset": "恢复默认观感",
			},
			en: {
				"nav.label": "PRTS",
				"settings.title": "PRTS",
				"settings.desc": "Rhodes Island terminal: square corners, black hairlines, caution yellow. Surfaces are opaque, and light/dark can follow the app theme.",
				"settings.appearance": "Appearance",
				"settings.appearance.desc": "Follow the app theme, or force Paper (light) / Terminal (dark).",
				"settings.accent": "Accent",
				"settings.accent.desc": "Reserved for current / clickable / running / focus.",
				"settings.radius": "Corner radius",
				"settings.radius.desc": "PRTS is square; Bench and Round are escape hatches.",
				"settings.texture": "Texture",
				"settings.texture.desc": "Full-screen grid, scanlines and corner registration marks.",
				"settings.lift": "Hard shadows",
				"settings.lift.desc": "Offset solid shadows on overlays plus press displacement on buttons.",
				"settings.din": "DIN lettering",
				"settings.din.desc": "Latin text uses Bahnschrift; Chinese falls back to YaHei.",
								"settings.skin": "Skin",
				"settings.skin.desc": "The first option, Native, restores the default look; the rest are the skins registered with the console.",
				"settings.skin.native": "Native (default look)",
				"settings.skin.this": "This skin (PRTS)",

				"settings.reset": "Reset appearance",
			},
		};
		var OPTION_TABLES = {
			appearance: { follow: { label: "跟随应用" }, paper: { label: "纸面（亮）" }, terminal: { label: "终端（暗）" } },
			accent: ACCENTS,
			radius: RADII,
		};
		var ROW_DEFS = [
			{ key: "appearance", labelKey: "settings.appearance", descKey: "settings.appearance.desc" },
			{ key: "accent", labelKey: "settings.accent", descKey: "settings.accent.desc" },
			{ key: "radius", labelKey: "settings.radius", descKey: "settings.radius.desc" },
		];
		var FLAG_DEFS = [
			{ key: "texture", labelKey: "settings.texture", descKey: "settings.texture.desc" },
			{ key: "lift", labelKey: "settings.lift", descKey: "settings.lift.desc" },
			{ key: "din", labelKey: "settings.din", descKey: "settings.din.desc" },
		];

		/** 「皮肤」选择器：第一项是「原生」（= 还原默认皮肤），其余来自控制台已登记的皮肤。 */
		function buildSkinSelectorRow(t) {
			return function SkinSelectorRow() {
				var api = consoleApiRef;
				var pair = React.useState(0);
				var bump = pair[1];
				React.useEffect(function () {
					if (!api || typeof api.subscribe !== "function") return undefined;
					return api.subscribe(function () { bump(function (n) { return n + 1; }); });
				}, []);
				var options = [{ id: "default", label: t("settings.skin.native") }];
				var current = "default";
				if (api === null) {
					// 自立模式：只有「原生 / 本皮肤」两项，选它就是开关自己
					options.push({ id: SKIN_ID, label: t("settings.skin.this") });
					current = readSettings().enabled === false ? "default" : SKIN_ID;
				} else {
					try {
						current = (typeof api.current === "function" ? api.current() : "default") || "default";
						if (typeof api.list === "function") {
							(api.list() || []).forEach(function (item) {
								if (item && typeof item.id === "string" && item.id !== "default") {
									options.push({ id: item.id, label: item.name || item.id });
								}
							});
						}
					} catch (error) { /* 控制台异常时至少保留"原生" */ }
				}
				return React.createElement("div", { className: CSS_PREFIX + "-row", key: "skin-pick" },
					React.createElement("div", { className: CSS_PREFIX + "-rowText" },
						React.createElement("div", { className: CSS_PREFIX + "-label" }, t("settings.skin")),
						React.createElement("div", { className: CSS_PREFIX + "-desc" }, t("settings.skin.desc"))),
					React.createElement("select", {
						value: current,
						"aria-label": t("settings.skin"),
						onChange: function (event) {
							var target = event.target.value;
							if (api === null) { writeSettings({ enabled: target === SKIN_ID }); return; }
							try {
								if (typeof api.switchTo === "function") api.switchTo(target);
							} catch (error) { /* 忽略 */ }
						},
					}, options.map(function (o) {
						return React.createElement("option", { key: o.id, value: o.id }, o.label);
					})));
			};
		}

		function createAppearanceSection(t, standalone) {
			return function PrtsAppearanceSection() {
				var pair = React.useState(readSettings);
				var state = pair[0], setState = pair[1];
				React.useEffect(function () {
					var off = subscribe(function () { setState(readSettings()); });
					return off;
				}, []);
				var skinRow = React.createElement(buildSkinSelectorRow(t));
				var selects = ROW_DEFS.map(function (def) {
					var table = OPTION_TABLES[def.key];
					return React.createElement("div", { className: CSS_PREFIX + "-row", key: def.key },
						React.createElement("div", { className: CSS_PREFIX + "-rowText" },
							React.createElement("div", { className: CSS_PREFIX + "-label" }, t(def.labelKey)),
							React.createElement("div", { className: CSS_PREFIX + "-desc" }, t(def.descKey))),
						React.createElement("select", {
							value: state[def.key],
							"aria-label": t(def.labelKey),
							onChange: function (event) { var p = {}; p[def.key] = event.target.value; setState(writeSettings(p)); },
						}, Object.keys(table).map(function (value) {
							return React.createElement("option", { key: value, value: value }, table[value].label);
						})));
				});
				var flags = FLAG_DEFS.map(function (def) {
					return React.createElement("div", { className: CSS_PREFIX + "-row", key: def.key },
						React.createElement("div", { className: CSS_PREFIX + "-rowText" },
							React.createElement("div", { className: CSS_PREFIX + "-label" }, t(def.labelKey)),
							React.createElement("div", { className: CSS_PREFIX + "-desc" }, t(def.descKey))),
						React.createElement("input", {
							type: "checkbox",
							checked: state[def.key] === true,
							"aria-label": t(def.labelKey),
							onChange: function (event) { var p = {}; p[def.key] = event.target.checked; setState(writeSettings(p)); },
						}));
				});
				return React.createElement("div", { ["data-" + SECTION_ID]: "" },
					React.createElement("h3", null, t("settings.title")),
					React.createElement("p", null, t("settings.desc")),
					selects,
					flags,
					skinRow,
					React.createElement("div", { className: CSS_PREFIX + "-actions" },
						React.createElement("button", { type: "button", onClick: function () { setState(writeSettings(DEFAULTS)); } }, t("settings.reset"))));
			};
		}
		//#endregion

		//#region 皮肤登记：优先交给控制台托管；控制台缺席则自立运行
		exports.inject = ["theme", "slots", "locale"]; // 不静态等待控制台，改为运行时显式等待（见 apply）
		var GRACE_MS = 3000; // 控制台出现的宽限窗口：内出现就托管，超时则自立

		/** 统一对外接口：window.__dshSkins[<skinId>] */
		function exposeSkinApi(api) {
			var bag = window.__dshSkins;
			if (!bag || typeof bag !== "object") { bag = {}; window.__dshSkins = bag; }
			bag[SKIN_ID] = api;
			return function () { try { if (bag[SKIN_ID] === api) delete bag[SKIN_ID]; } catch (error) { /* 忽略 */ } };
		}

		/** 自立模式下的 SkinContext 替身。 */
		function standaloneSkinContext(ctx) {
			return { logger: ctx.logger || console, signal: new AbortController().signal, slots: ctx.slots, standalone: true };
		}

				/** 控制台服务引用（「皮肤」选择器靠它列出皮肤并切换；托管模式下由 apply 注入）。 */
		var consoleApiRef = null;

		exports.apply = function apply(ctx) {
			var activation = createActivation(ctx);
			var disposers = [];
			var mode = "pending"; // pending → console | standalone
			var consoleApi = null;
			var session = null;
			var graceTimer = null;

			var payload = {
				apiVersion: "dsh.ecosystem.ui-skin-loader/v1",
				id: SKIN_ID,
				name: SKIN_NAME,
				version: "1.0.8",
				author: "tenebris173",
				description: "罗德岛终端风格：直角切角 + 黑色发丝线 + 黄黑警示条 + 四角登记标记；亮/暗两套底，可跟随应用主题。",
				tags: ["light", "dark", "terminal", "square", "hud"],
				preview: PREVIEW_SVG,
				settingsHint: "设置 → 皮肤 → PRTS → 外观",
				activate: function (skinCtx) { activation.activate(skinCtx || standaloneSkinContext(ctx)); },
				deactivate: function () { activation.deactivate(); },
			};

			function enterConsole(api) {
				if (mode !== "pending") return;
				mode = "console";
				consoleApi = api;
				consoleApiRef = api; // 「皮肤」选择器靠它列出皮肤并切换
				disposers.push(api.registerSkin(payload));
				disposers.push(exposeSkinApi({
					mode: "console", skinId: SKIN_ID, version: "1.0.8",
					activate: function (skinCtx) { activation.activate(skinCtx || standaloneSkinContext(ctx)); },
					deactivate: function () { activation.deactivate(); },
					isActive: function () { return activation.isActive(); },
					getSettings: readSettings,
					setSettings: writeSettings,
				}));
			}

			function enterStandalone() {
				if (mode !== "pending") return;
				mode = "standalone";
				disposers.push(registerSection(ctx, true)); // 面板常驻，否则关掉就再也开不回来
				var sync = function () {
					var want = readSettings().enabled !== false;
					if (want && session === null) session = start(ctx, standaloneSkinContext(ctx));
					else if (!want && session !== null) { session.teardown(); session = null; }
				};
				sync();
				disposers.push(subscribe(sync));
				disposers.push(function () { if (session !== null) { session.teardown(); session = null; } });
				disposers.push(exposeSkinApi({
					mode: "standalone", skinId: SKIN_ID, version: "1.0.8",
					activate: function () { writeSettings({ enabled: true }); sync(); },
					deactivate: function () { writeSettings({ enabled: false }); if (session !== null) { session.teardown(); session = null; } },
					isActive: function () { return session !== null; },
					getSettings: readSettings,
					setSettings: writeSettings,
				}));
			}

			// ① 关键：让运行时在服务出现时回调（不是在 apply 时"看一眼"——
			//    那时控制台多半还没 provide，会被误判成"没有控制台"而错过登记）
			ctx.inject(["uiSkinLoader"], function (scoped) {
				var api = scoped && scoped.uiSkinLoader;
				if (api && typeof api.registerSkin === "function") enterConsole(api);
			});

			// ② 宽限窗口：控制台始终没出现 → 自立（有控制台时 ① 会先把它置为 console，这里就不会执行）
			graceTimer = setTimeout(function () { enterStandalone(); }, GRACE_MS);
			disposers.push(function () { if (graceTimer !== null) { clearTimeout(graceTimer); graceTimer = null; } });

			ctx.effect(function () {
				return function () {
					for (var i = disposers.length - 1; i >= 0; i--) {
						try { disposers[i](); } catch (error) { /* 单步失败不影响其余清理 */ }
					}
					consoleApiRef = null;
				};
			}, "skn-prts: dispose registration + standalone session");
		};
		//#endregion

		return module.exports;
	},
});
