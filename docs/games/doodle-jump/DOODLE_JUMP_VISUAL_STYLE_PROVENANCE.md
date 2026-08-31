# 《涂鸦跃层》视觉风格参考记录

- 资产：`art_sources/涂鸦跃层/flat-paper-ui-reference-v1.png`
- 用途：纯 2D 平面纸片界面风格参考，不作为运行时整屏纹理。
- 生成方式：内置 `image_gen` 生成，未使用外部素材或参考图。
- 生成日期：2026-08-26
- 生成输出：`exec-57c87b9c-7e51-4c2f-aea2-185ebcd86b78`
- 原始输出：`/Users/laitao/.codex/generated_images/01a03bd9-d842-7aa1-9432-c2197418425d/exec-57c87b9c-7e51-4c2f-aea2-185ebcd86b78.png`
- 当前交付：复制到 `art_sources/涂鸦跃层/flat-paper-ui-reference-v1.png`，作为已确认视觉基线。

## 首批游戏素材总览板（v2，当前修正版）

- 资产：`art_sources/涂鸦跃层/game-asset-overview-v2.png`
- 用途：按已确认稿纸参考图重做的游戏素材方向板，确认主角、纸飞机、平台、怪物、危险物和道具的统一风格；仍不直接作为运行时图集或整屏界面。
- 生成方式：内置 `image_gen` 以 `flat-paper-ui-reference-v1.png` 为主风格参考、以 v1 作为素材清单参考生成。
- 生成日期：2026-08-26
- 生成输出：`exec-c3651283-168d-4954-9439-007ff49ec9b3`
- 原始输出：`/Users/laitao/.codex/generated_images/01a03bd9-d842-7aa1-9432-c2197418425d/exec-c3651283-168d-4954-9439-007ff49ec9b3.png`
- 当前交付：复制到 `art_sources/涂鸦跃层/game-asset-overview-v2.png`。

v2 采用竖向暖白稿纸、浅蓝横线、细铅笔线、低饱和彩笔平涂、松散留白和轻微平面剪裁边缘；正式单张素材仍需按透明背景、运行时锚点和碰撞盒单独生成与清理。

### 总览板提示词摘要

横向暖白稿纸素材板，按角色与攻击物、平台、怪物与危险物、道具四区排列；包含纸片主角、纸飞机、六类平台、三种怪物、UFO、黑洞、捕兽夹以及六种道具。使用纯 2D 正交、正面纸片、铅笔手绘轮廓、彩笔/蜡笔平涂、窄白色纸边和参考图同款低对比软边偏移落影。禁止 3D、厚度、倒角、硬边或大面积真实投影、金属、玻璃、霓虹、Logo、文字、水印和原版可识别素材。

正式单张素材生成时，窄白色纸边和柔和偏移落影可以作为同一透明 Sprite 的预烘焙效果保留；需去除过厚白边、硬边和大面积贴纸投影，将浮纸感收敛为低对比、软边、统一方向的轻微效果。同时为每个对象单独生成透明背景版本，按运行时锚点和碰撞盒重新校验。

角色一致性补充：参考图中的主角上半身为锁定造型，头部/发型、脸部、青绿色躯干、红色围巾、双臂轮廓、比例和配色必须保持一致；全身 Sprite 只允许为自然站立姿势补齐和清理下半身，不得借此重新设计上半身。

道具使用状态的资产边界：Rocket、Jetpack、Propeller Hat 分别采用独立的完整“主角＋道具”组合图，组合图共用基础主角的上半身、自然站姿、脚底基线和锚点；Shield 改用一张独立透明 Shield Overlay，运行时叠加到基础图或任一飞行道具组合图上，并复用玩家中心和局部挂载基准，不制作“主角＋护盾”完整组合图。火焰、喷气、气流、螺旋桨旋转线、护盾脉冲、纸屑和拖尾仍保持为独立 VFX；这些动态效果不烘焙进基础图、组合图或 Shield Overlay。

## 纵向无缝背景 v2（2026-08-30）

- 生成方式：Codex 内置 `image_gen`，生成三张暖白稿纸、云层草稿、星空剪贴簿主题源图；原始输出分别为 `exec-3496bf91-18dd-4511-aa67-08f3afadb0c3`、`exec-5d912164-52db-4cb7-a939-e20177138f98`、`exec-b056e258-5318-4376-9bc1-18ce7816580f`。
- 源图归档：`art_sources/涂鸦跃层/背景/seamless_sources_v2/`；运行时派生图位于 `assets/games/doodle-jump/visual/backgrounds/parallax-v2/`。
- 派生方式：`tools/process-doodle-jump-visuals.py` 将源图制成上下像素严格一致的 750×1334 纵向镜像平铺图，并生成暖白→云层、云层→星空两张过渡图；暖白层只加强横向行线并保留源图纸纤维，不添加纵向方格线。
- 旧版曾让六类平台共用运行时 Shadow Sprite；该方案已于 2026-08-30 停用。
- 生成提示词共同约束：纯 2D 正交纸张/彩铅质感，中央 65% 保持玩法留白，纵向首尾无缝，无角色、平台、文字、Logo、透视、3D、硬阴影和水印。三张图分别使用暖象牙稿纸、低饱和蓝灰云线纸张、深蓝紫星空剪贴纸方向。

该 v2 生成底图因实际运行时纹理过密、云线重复且与透明装饰叠加后画面偏脏，于 2026-08-30 停止作为运行时输入；生成源仍保留用于追溯，不再被 Bundle 引用。

## 纵向无缝背景 v3

- 运行时底图改回既有正式素材 `background_warm_paper.png`、`background_cloud_dark.png`、`background_star_scrapbook.png`，不再使用 AI 新生成底图。
- `tools/process-doodle-jump-visuals.py` 从每张原图中央干净区域派生 750×1334 上下镜像无缝图，保留原配色、纸张质感和边缘构图；两张主题过渡图由相邻正式底图直接渐变生成。
- 上层视差装饰只使用 `background_decor/` 中既有素材；处理脚本仅裁边，运行时节点池按局内种子随机决定小图的位置、尺寸、角度和 Alpha，不使用整张循环装饰贴图。
- 装饰池从 14 个缩减到 7 个，纵向平均间隔从约 150 提高到约 275 units，减少堆叠并让分布更分散。

## 纵向无缝背景 v4（当前，2026-08-31）

- 在暖白稿纸和既有深色云层之间新增天蓝天空纸背景 `art_sources/涂鸦跃层/背景/background_sky_blue.png`；暖白、深色云层和星空仍沿用 v3 正式源图。
- 新图由 Codex 内置 `image_gen` 参考三张既有正式背景生成；采用输出 `exec-56e57bda-f2d5-483d-8069-d98ec11b64fe`，原始输出位于 `C:/Users/laitao/.codex/generated_images/01a050d1-d790-7b60-89d0-b6a669e79afb/exec-56e57bda-f2d5-483d-8069-d98ec11b64fe.png`。
- 生成方向为低饱和浅天蓝纸面、细横向稿纸线、少量边缘撕纸云和铅笔云线，中央 70% 保持玩法留白；禁止角色、平台、UI、文字、写实天空、密集装饰和数字渐变质感。
- `tools/process-doodle-jump-visuals.py` 派生 `base-sky-tile.png`，并生成暖白→天空、天空→深云、深云→星空三张过渡图；运行时顺序为 0–250m 暖白、250–600m 天空、600–950m 深云、950m 以上星空。
- v4 最初沿用既有透明云朵、折纸和纸屑装饰池；该装饰因与底图材质、颜色过于接近，已在下述装饰 v2 中停止作为运行时输入。

## 分主题背景装饰 v2（当前，2026-08-31）

- 使用 Codex 内置 `image_gen` 生成四张 2×2 透明图集，源图归档于 `art_sources/涂鸦跃层/背景/background_decor_v2/`；处理脚本切成十六张独立 RGBA Sprite，运行时派生目录为 `visual/backgrounds/decor-v2/`。
- 暖纸套：长尾夹、图钉、回形针、彩笔旋线；生成输出 `exec-8aa2a5d9-21e7-48d7-aa95-ef3f1609ba97`。
- 天空套：太阳、风筝、彩虹、风线；生成输出 `exec-642db533-90e2-4c00-bde0-7df957879d90`。
- 深云套：闪电、雨滴、警戒折线、月亮风线；生成输出 `exec-7041e35b-4c6f-470a-8ff1-17a6da85ecee`。
- 星空套：星座、月亮、行星、彗星；生成输出 `exec-28519f76-6e13-44cd-b8a3-426e7014e442`。
- 四套共同约束：透明背景、纯 2D 纸片涂鸦、彩铅填色、铅笔轮廓、窄暖白纸边和贴近轮廓的低对比软影；色彩和明度必须与对应底图拉开，禁止平台状横条、角色、玩法物件、UI、文字、写实物体、3D 和霓虹发光。
- 运行时保持 275 units 基础间隔和 seed 确定性散布，尺寸收敛到 56–108 units，Alpha 提高到约 61%–84%，使装饰可辨识但仍位于平台、道具和角色之后。旧 `visual/backgrounds/decor-items/` 派生目录已移除，旧源图保留追溯但不再进入 Bundle。

## 平台自带阴影与状态特效 v2（当前）

- 曾尝试用内置 `image_gen` 编辑 `platform_base_sheet.png` 添加阴影，但两次输出都把透明棋盘格烘进 RGB 图，因此没有进入运行时资源；错误候选已移出工作区并在 Codex 生成目录明确标记为 `platform_base_sheet_shadowed_v2_REJECTED_CHECKERBOARD.png`。
- 正式运行图由 `tools/process-doodle-jump-visuals.py` 从六张原始 RGBA 平台逐张处理：先按 Alpha 裁边，再把原 Alpha 蒙版模糊并右下偏移，最后与原平台合成到同一张 RGBA。阴影因此属于图片自身，不存在代码生成或额外 Shadow 节点。
- 输出位于 `assets/games/doodle-jump/visual/platforms/platform-*-shadowed-v2.png`。Breakable 左右半片也从带阴影版本派生。
- Disappearing 使用既有 `platform_vfx_disappearing_fade.png` 派生的纸屑淡出环；Exploding 使用既有倒计时环和爆裂碎片图。处理只做透明裁边，没有借用其他游戏资产。

## 最终提示词摘要

生成一张原创竖屏手机跳跃游戏界面效果图，展示纯 2D 平面纸片、暖白稿纸、铅笔勾线、彩笔平涂、窄白色纸边、参考图同款柔和偏移落影、平面剪纸平台、纸片角色、纸飞机子弹、弹簧、蹦床、怪物、UFO 和紧凑纸片 HUD。主角上半身必须严格保持参考图中的头部/发型、脸部、青绿色躯干、红色围巾、双臂轮廓、比例和配色，不能重新设计。落影应是每个透明纸片素材自身的低对比预烘焙效果，不由代码后加。构图采用 9:16 竖屏、正交视图、中央玩法区留白和顶部安全区。禁止 3D 纸艺、厚度、倒角、挤出、透视、体积光、强烈实时投影、玻璃、金属、霓虹、Logo、品牌、可读文字和原版可识别角色或素材。

## 落地纸屑特效 v3（当前）

- 生成方式：Codex 内置 `image_gen`，以既有 `landing_rebound.png`、`platform_vfx_explosion_fragments.png`、`enemy_defeat_fragments.png` 为风格参考生成新构图。
- 生成日期：2026-08-30；采用输出：`exec-30e6087b-7932-4cb1-b904-7f740c37f2dd`。
- 源图归档：`art_sources/涂鸦跃层/特效/generated/landing_paper_debris_v3.png`；运行时派生图：`assets/games/doodle-jump/visual/effects/landing-paper-debris-v3.png`。
- 派生方式：`tools/process-doodle-jump-visuals.py` 使用 Alpha 阈值 12 剔除生成图中的极低透明度噪点并紧边裁切，保留真正可见的透明碎屑。
- 风格约束：与既有特效保持粗暖白纸边、灰黑铅笔轮廓、扁分彩铅排线和低细节平面剪纸；禁止写实厚纸、体积阴影、烟尘堆、水波圆环和代码纯色色块。
- 第一张无参考生成的写实纸屑候选 `exec-72f6c357-e189-45de-a0db-8a54a4b58e6a` 因材质、阴影和体积感偏离游戏方向而废弃，未被运行时引用。

## 阶段 5 怪物与战斗反馈（当前）

- 源资产：`art_sources/涂鸦跃层/敌人/enemy_frames/` 内 Small、Large、Hover 各两帧透明 PNG，以及 `art_sources/涂鸦跃层/特效/common_vfx/` 内 `paper_plane_hit_scratches.png`、`enemy_defeat_fragments.png`。
- 运行时派生：`assets/games/doodle-jump/visual/enemies/` 与 `assets/games/doodle-jump/visual/effects/enemy-*.png`。
- 派生方式：`tools/process-doodle-jump-visuals.py` 仅按 Alpha 可见范围紧边裁切并保留原有预烘焙纸片边缘和落影，没有运行时代码阴影，也没有跨游戏复用素材。
- 锚点与碰撞参考：地面怪物碰撞盒底边贴平台逻辑顶面；同类两帧先放入共享透明画布并按底部中心归一化，运行时再补偿平台预烘焙图片的可见上沿和怪物帧底部透明留边，使脚底最低可见点贴合平台表面。Hover 以平台顶面上方 90 units 为锚点，不使用地面补偿；开发态可叠加身体盒与头部区辅助线。
- 主角怪物接触反馈：源图 `art_sources/涂鸦跃层/特效/failure_vfx/enemy_contact_impact.png`，运行时派生图 `assets/games/doodle-jump/visual/effects/player-enemy-contact-impact.png`；处理脚本只按 Alpha 紧边裁切。该图仅用于 `monster-contact`，以主角局部坐标挂载并位于主角前景，普通掉落不复用。

## 阶段 6 危险物与失败反馈（当前）

- 源资产：`art_sources/涂鸦跃层/危险物/hazard_frames/` 内 UFO、光束、锁定框、束缚线、黑洞外环/核心、捕兽夹及触发闪光；原 `hazard_ufo.png` 的右侧纸片轮廓缺失，2026-08-31 以该图为唯一编辑参考通过内置 `image_gen` 补全为 `hazard_ufo_complete.png`，采用输出 `exec-7f934069-3c9e-4b8e-ba75-03efc4a72e7e`，没有引用外部游戏素材；失败图来自 `art_sources/涂鸦跃层/特效/failure_vfx/`。
- 运行时派生：`assets/games/doodle-jump/visual/hazards/` 和 `assets/games/doodle-jump/visual/effects/failure-*.png`。`tools/process-doodle-jump-visuals.py` 只做 Alpha 紧边裁切，不改变原色、纸边或笔触，也不跨游戏复用素材。
- UFO 由独立舱体、半透明光束、红色纸片锁定框和紫色束缚线分层组合；锁定、吸附和子弹停顿分别由 Alpha、缩放/旋转及受击反色表达。黑洞外环与核心反向低速旋转；捕兽夹触发时叠加既有红白爆闪图。
- 三类失败图挂在主角局部前景并跟随原因动画：UFO 向光束中心上收淡出、黑洞缩小旋入核心、捕兽夹在脚下闭合闪光。所有失败表现均使用本游戏自身正式图片，不用代码色块替代主体特效。

## 阶段 7 道具与能力反馈（当前）

- 源资产：`art_sources/涂鸦跃层/主角/` 内基础运行图、Jetpack/Propeller Hat/Rocket 三张完整角色组合图及独立 `shield_overlay.png`；六种拾取物来自 `道具/pickups/`；拾取、护盾抵挡和能力运动图来自 `特效/common_vfx/` 与 `特效/item_motion_vfx/`。
- 运行时派生：`assets/games/doodle-jump/visual/player/`、`visual/items/` 和 `visual/effects/`。`tools/process-doodle-jump-visuals.py` 对拾取物、Overlay 和特效按 Alpha 紧边裁切；四张完整角色图先共同裁取可见范围，再放入同尺寸透明画布并按底部中心对齐，因此切换能力时脚底基线和玩家局部锚点不跳变。
- Rocket、Jetpack、Propeller Hat 激活时切换对应完整组合 Sprite；Shield 始终以独立 Overlay 叠加，可与任一组合图同时显示。喷气、火箭、气流和 Head Start 使用独立运动特效，Spring/Trampoline 在有效落地时使用各自反弹图，拾取和抵挡也使用既有正式透明图。
- 全部素材仅来自本游戏自己的 `art_sources/涂鸦跃层`，没有引用大厅或其他小游戏资源，也没有使用运行时代码色块、统一 DropShadow 或 3D 效果替代正式主体图。

## 主角独立落地帧 v1（当前，2026-08-31）

- 现有正式 `player_ready_standing.png` 的自然站立姿势正好满足落地帧要求，因此没有重新生成相似角色，避免头部、脸部、围巾和纸张纹理发生漂移；该图无损复制为语义明确的源资产 `art_sources/涂鸦跃层/主角/player_landing_standing.png`。
- `tools/process-doodle-jump-visuals.py` 仅按 Alpha 紧边并保留 8px 安全边，派生为 `assets/games/doodle-jump/visual/player/player-landing.png`。运行时只在有效落地后显示约 0.06 秒，沿用当前朝向翻转、玩家节点和碰撞盒，双脚最低点与平台可见上沿共用现有脚底基线。
- 开局自动起跳、从平台下方穿过、Breakable 断裂和飞行道具期间不使用落地帧；未调用图像生成模型，也没有引入外部素材。

## 弹簧拾取物改色 v2（当前，2026-08-31）

- 生成方式：Codex 内置 `image_gen`，以既有 `visual/items/pickup-spring.png` 为唯一编辑目标，只调整主体配色并保持轮廓、比例、纸边、铅笔线、彩铅排线、阴影和透明背景。
- 采用输出：`exec-316e65b6-ed6b-4bd4-888f-5d34a2a38d1c`；原始输出归档为 `art_sources/涂鸦跃层/道具/pickups/pickup_spring_coral_v2_source.png`。
- 运行时资产：`assets/games/doodle-jump/visual/items/pickup-spring-v2.png`，规范化到与旧图一致的 329×404 透明画布；弹簧改为暖珊瑚红、底座改为低饱和金黄，从蓝绿色 Normal 平台中明确区分。
- 所有拾取物继续复用本游戏既有 `item-pickup-sparkles.png`，运行时作为主体后方的常驻纸片星芒，以 seed 错峰进行低频缩放、旋转和透明度呼吸；没有引入跨游戏资源或代码纯色色块。

## 阶段 9 正式 UI 与引导（当前）

- 源资产：`art_sources/涂鸦跃层/UI/hud_components/`、`overlay_panels/` 和 `tutorial_illustrations/` 内的独立透明 PNG；道具 HUD 图标来自本游戏 `道具/pickups/` 现有图片。
- 运行时派生：`assets/games/doodle-jump/visual/ui/hud/`、`panels/`、`tutorial/` 和 `item-icons/`。`tools/process-doodle-jump-visuals.py` 仅依 Alpha 可见包围紧边裁切并保留原有纸边、铅笔线和预烘焙软影，没有重画或从其他游戏借用皮肤。
- HUD 使用分数卡、高度卡、暂停图标和书本指引入口；分数/高度完整卡按 `gameplay-runtime-hud-actual-assets.png` 的原型横向排列，不做九宫格变形。持续道具状态使用左侧既有图标和右侧新进度条 `item_progress_bar_fill.png`，不显示道具名或剩余时间数字；该进度条于 2026-08-31 以实际 HUD 原型和 `score_card.png` 为参考通过内置 `image_gen` 生成，采用输出 `exec-70412d0d-964a-414d-9c8d-8fa9ecee4471`，仅用于本游戏。
- Loading、传感器校准、Head Start/教程、暂停、传感器错误、复活、结果和资源缺失分别使用本游戏独立面板；正式 Loading 面板先于动态世界创建完成，运行时 Graphics 不会作为角色、平台或背景闪现在玩家可见加载阶段。
- 教程使用倾斜传感器、纸飞机射击和危险符号三张图；平台与危险物本身同时保留独立轮廓、纹理/裂纹、运动线和文字名称，信息不只依赖颜色。

## 阶段 10 动画补齐与导入策略（当前）

- 本阶段实际启用的下坠拖痕、穿屏残影、纸飞机拖尾/命中图、护盾脉冲、飞行能力副特效、复活脉冲、平台裂纹/运动线和普通掉落失败图来自既有 `art_sources/涂鸦跃层/特效`、`投射物` 和 `平台/state_vfx`；上升线不再在运行时加载。右上书本指引按钮 `art_sources/涂鸦跃层/UI/hud_components/rules_button.png` 以本游戏暂停按钮为编辑参考，通过内置图像生成工具生成，要求保留浅紫纸片、奶油裁边、铅笔线和窄右下软影，并输出真实透明背景；派生图为 `visual/ui/hud/rules-button.png`。
- `tools/process-doodle-jump-visuals.py` 只执行 Alpha 紧边和既有规范化；`tools/configure-doodle-jump-textures.mjs` 只修改 Cocos 导入采样、环绕和 Alpha 边缘配置，不改变图像内容。
- 正式资源分组、锚点、碰撞参考、图集预算、九宫格、序列帧、降级规则和音频预留路径统一记录于 `DOODLE_JUMP_FORMAL_ASSET_MANIFEST.md`。
- 用于追溯的过期候选仍保留在 `art_sources`，但未被运行时路径引用；游戏当前共有 129 张 PNG 派生资源，缺失的主体图会进入本游戏自有资源缺失页，不退回代码色块游玩。
