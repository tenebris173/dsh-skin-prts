//#region src/index.ts
/**
 * 宿主半：只做**依赖自检**。
 *
 * 本皮肤的全部观感副作用在 client 半，由加载器在 activate 时下发的 SkinContext 驱动；
 * 宿主半不导出 Config、不做任何界面改动。
 *
 * 但有一个必须处理的现实：本皮肤依赖**第三方皮肤加载器**提供的 `uiSkinLoader` 服务
 * （参考实现 `@dsh-eac/ui-skin-loader`，它同时提供「设置 → 皮肤」页面）。
 * 该服务缺失时 client 半会因 `inject` 未满足而静默挂起 —— 不报错、也没效果，
 * 安装者极易误判成"装失败"。所以这里延迟检查一次并给出可操作的提示。
 */
const SERVICE = "uiSkinLoader";
const REFERENCE = "@dsh-eac/ui-skin-loader";

/**
 * @param {object} ctx 宿主插件上下文（Cordis）
 */
function apply(ctx) {
	const check = () => {
		let available = false;
		try {
			available = Boolean(ctx.uiSkinLoader) || Boolean(ctx.get && ctx.get(SERVICE));
		} catch (error) {
			available = false;
		}
		if (available) return;
		const message =
			"[prts] 未检测到提供 " + SERVICE + " 服务的皮肤加载器（参考实现： " + REFERENCE + "）。" +
			"本皮肤不会生效 —— 它只负责观感，皮肤的发现 / 切换 / 持久化由加载器提供。" +
			"请先安装加载器（装好后「设置 → 皮肤」页面会出现），再安装本皮肤并重启 DSH。";
		if (ctx.logger && typeof ctx.logger.warn === "function") ctx.logger.warn(message);
		else console.warn(message);
	};
	const timer = setTimeout(check, 4000);
	if (typeof ctx.effect === "function") {
		ctx.effect(() => () => clearTimeout(timer), "prts: dependency preflight");
	}
}
//#endregion
export { apply };
