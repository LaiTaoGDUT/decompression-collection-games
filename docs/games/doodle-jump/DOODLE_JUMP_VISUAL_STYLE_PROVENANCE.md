# 《纸片跳跃》视觉风格参考记录

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

## 升降平台与倒刺平台独立图片 v1（当前，2026-09-02）

- 生成方式：Codex 内置 `image_gen`，以本游戏 `platform-normal-shadowed-v2.png` 和 `platform-moving-shadowed-v2.png` 为视觉参考；没有使用外部游戏素材。
- 升降平台采用输出 `exec-48abd1da-67f3-41ed-92d7-56c31f85a9b3`，归档为 `art_sources/涂鸦跃层/平台/generated/platform_vertical_moving_source_v1.png`。最终提示词锁定蓝紫纸片、4 至 5 条内部纵向暖白裁线、平坦顶面、透明独立 Sprite，并明确禁止上下箭头、方向符号和外置运动线。
- 升降平台原始输出把浅色棋盘格烘焙进 RGB；`tools/process-doodle-jump-visuals.py` 依据中心连通主体执行确定性背景分离、Alpha 紧边和与既有平台一致的软影烘焙，运行时派生为 `visual/platforms/platform-vertical-moving-shadowed-v1.png`。
- 倒刺平台采用输出 `exec-e97a6dac-8c44-4103-bbfa-4efeafe43cd5`，归档为 `art_sources/涂鸦跃层/平台/generated/platform_spiked_source_v1.png`；运行时派生为 `visual/platforms/platform-spiked-shadowed-v1.png`。提示词锁定完整青绿色平顶、珊瑚红与暗紫警示纸带、只向下伸出的纸片倒刺和真实透明背景。
- 两种平台均由各自独立图片承担完整外观；运行时已移除升降箭头和 Graphics 倒刺包装，碰撞体、升降轨迹与第四背景解锁规则不随图片尺寸变化。

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
- 怪物体型：Small、Large、Hover 三类怪物的正式 Sprite、身体碰撞盒、头顶踩踏区和占位范围均统一放大到原来的 `2×`，并继续以碰撞盒底边为视觉落脚锚点。到达 Large 解锁高度后，动态生成的 Normal 平台直接使用 `236–280 units` 的宽度范围，完整承载放大后的大型怪物并保留两侧纸片留边；禁止先生成窄平台、再在怪物出现或存档恢复时补宽。
- 主角怪物接触反馈：源图 `art_sources/涂鸦跃层/特效/failure_vfx/enemy_contact_impact.png`，运行时派生图 `assets/games/doodle-jump/visual/effects/player-enemy-contact-impact.png`；处理脚本只按 Alpha 紧边裁切。该图仅用于 `monster-contact`，以主角局部坐标挂载并位于主角前景，普通掉落不复用。

## 阶段 6 危险物与失败反馈（当前）

- 源资产：`art_sources/涂鸦跃层/危险物/hazard_frames/` 内 UFO、光束、锁定框、束缚线、黑洞外环/核心、捕兽夹及触发闪光；原 `hazard_ufo.png` 的右侧纸片轮廓缺失，2026-08-31 以该图为唯一编辑参考通过内置 `image_gen` 补全为 `hazard_ufo_complete.png`，采用输出 `exec-7f934069-3c9e-4b8e-ba75-03efc4a72e7e`，没有引用外部游戏素材；失败图来自 `art_sources/涂鸦跃层/特效/failure_vfx/`。
- 运行时派生：`assets/games/doodle-jump/visual/hazards/` 和 `assets/games/doodle-jump/visual/effects/failure-*.png`。`tools/process-doodle-jump-visuals.py` 只做 Alpha 紧边裁切，不改变原色、纸边或笔触，也不跨游戏复用素材。
- UFO 由独立舱体、半透明光束、红色纸片锁定框和紫色束缚线分层组合；锁定、吸附和子弹停顿分别由 Alpha、缩放/旋转及受击反色表达。黑洞外环与核心反向低速旋转；捕兽夹触发时叠加既有红白爆闪图。
- 三类失败图挂在主角局部前景并跟随原因动画：UFO 向光束中心上收淡出、黑洞缩小旋入核心、捕兽夹在脚下闭合闪光。所有失败表现均使用本游戏自身正式图片，不用代码色块替代主体特效。

## 阶段 7 道具与能力反馈（当前）

- 源资产：`art_sources/涂鸦跃层/主角/` 内基础运行图、独立生成的 Jetpack/Propeller Hat/Rocket 装备图及 `shield_overlay.png`；六种拾取物来自 `道具/pickups/`；拾取、护盾抵挡和能力运动图来自 `特效/common_vfx/` 与 `特效/item_motion_vfx/`。旧的三张完整角色组合图只作为历史参考，不再进入正式构建。
- 运行时派生：`assets/games/doodle-jump/visual/player/`、`visual/items/` 和 `visual/effects/`。`tools/process-doodle-jump-visuals.py` 对独立装备、拾取物、Overlay 和特效按 Alpha 紧边裁切，并为每件装备保留稳定的局部锚点；飞行能力切换时基础主角 Sprite、脚底基线和碰撞体不切图、不跳变。
- 三种飞行能力统一使用“基础主角 + 独立装备”分层结构。Jetpack 位于主角后层，主体被主角躯干自然遮挡，仅露出背包、侧带和喷口；Rocket 位于主角前层，以更大的竖直火箭壳包住主角，舷窗区域必须是真实透明 Alpha，可透出基础主角的头部；Propeller Hat 使用独立帽体与独立扇叶。Shield 始终以独立 Overlay 叠加，可与任一能力状态同时显示。
- Jetpack、Propeller Hat、Rocket 的持续时间结束时统一播放装备脱落：装备从当前主角世界坐标分离，先向侧上方抛出，再受重力沿抛物线下落并旋转，完全掉出屏幕下方后回收；主角不跟随装备旋转或偏移。Propeller Hat 脱落时帽体与扇叶作为一个整体离开，扇叶在脱落期间继续进行竖轴旋转投影。
- Propeller Hat 的飞行表现改为“基础主角 + 固定帽体 + 独立扇叶”：不再使用 `player_with_propeller_hat.png` 组合角色图。正式帽子源图为 `art_sources/涂鸦跃层/主角/player_propeller_hat_generated.png`，由内置 ImageGen 以本游戏 `pickup-propeller-hat.png` 和基础主角为风格参考生成；运行时派生为 `visual/player/player-propeller-hat-cap.png` 与 `visual/player/player-propeller-hat-blades.png`。帽体固定覆盖在主角头顶；扇叶绕竖直轴旋转，正面投影使用“展开 → 横向压缩至侧面 → 翻面 → 再展开”的周期缩放，禁止把帽体或扇叶 Sprite 绕屏幕法线做平面转圈。运行时不再叠加 `propeller_airflow.png` 或 `propeller_rotation_lines.png`。
- Propeller Hat 的帽体和扇叶运行时尺寸均缩至上一版的约 `2/3`，以相同局部锚点关系整体上移，避免遮挡角色脸部；帽体保持固定，只有扇叶执行竖轴旋转投影。
- ImageGen 最终提示词要点：独立 2D 游戏装备 Sprite；完整竹蜻蜓帽子；红、芥末黄、青绿三片纸帽与水平双叶；手绘纸片拼贴、炭笔轮廓、纸张颗粒；正视、居中、透明背景；禁止角色身体、背景、气流、运动线、文字、Logo 和水印。
- Jetpack 正式源图为 `art_sources/涂鸦跃层/主角/player_jetpack_generated.png`，由内置 ImageGen 以拾取物、基础主角和旧组合图为造型/尺度参考生成，采用输出 `exec-75a4cf94-21b8-4923-a4b1-952f58874c6a`；提示词锁定双青绿纸罐、珊瑚红喷口、芥末黄束带、炭笔中心架与肩带，要求独立透明装备、不含主角和火焰。运行时派生为 `visual/player/player-jetpack.png`。
- Rocket 正式源图为 `art_sources/涂鸦跃层/主角/player_rocket_generated.png`，由内置 ImageGen 以拾取物、基础主角和旧组合图为参考生成，采用透明度修正版输出 `exec-f749ba50-eb03-49bd-9aa9-b808315ca6ac`；提示词锁定竖直大火箭、青绿壳体、珊瑚红头锥/尾翼、芥末黄饰边和大圆舷窗。模型输出把棋盘格烘焙进 RGB，因此素材管线只做确定性的背景分离，并将舷窗内圈裁为真实 `alpha=0`，不重绘火箭主体。运行时派生为 `visual/player/player-rocket.png`。
- Bear Trap 的主体必须始终以 `0°` 平放在平台表面；危险物节点池复用时须重置主体 Sprite 的位置、缩放、颜色与旋转，不能继承 UFO 摆动等上一种危险物的子节点变换。
- 全部素材仅来自本游戏自己的 `art_sources/涂鸦跃层`，没有引用大厅或其他小游戏资源，也没有使用运行时代码色块、统一 DropShadow 或 3D 效果替代正式主体图。

## 主角独立落地帧 v1（已移除，2026-09-02）

- 运行时不再加载或切换专用落地帧；有效落地只保留纸屑反馈、音效与统计，主角持续使用基础自然站姿。
- 不再保留 `player_landing_standing.png` 源副本和 `player-landing.png` 派生图，素材处理脚本也不会重新生成它们。

## 弹簧拾取物改色 v2（当前，2026-08-31）

- 生成方式：Codex 内置 `image_gen`，以既有 `visual/items/pickup-spring.png` 为唯一编辑目标，只调整主体配色并保持轮廓、比例、纸边、铅笔线、彩铅排线、阴影和透明背景。
- 采用输出：`exec-316e65b6-ed6b-4bd4-888f-5d34a2a38d1c`；原始输出归档为 `art_sources/涂鸦跃层/道具/pickups/pickup_spring_coral_v2_source.png`。
- 运行时资产：`assets/games/doodle-jump/visual/items/pickup-spring-v2.png`，规范化到与旧图一致的 329×404 透明画布；弹簧改为暖珊瑚红、底座改为低饱和金黄，从蓝绿色 Normal 平台中明确区分。
- 所有拾取物继续复用本游戏既有 `item-pickup-sparkles.png`，运行时作为主体后方的常驻纸片星芒，以 seed 错峰进行低频缩放、旋转和透明度呼吸；没有引入跨游戏资源或代码纯色色块。

## 弹簧反弹特效配色统一 v2（当前，2026-09-01）

- 编辑目标：`art_sources/涂鸦跃层/特效/item_motion_vfx/spring_rebound.png`；仅调整原图蓝绿色区域的色相和饱和度，上半部弹簧线圈统一为拾取物的暖珊瑚红，下半部反弹环统一为底座的低饱和金黄。
- 内置 `image_gen` 用于比对珊瑚红＋金黄方案，生成候选因改变构图且未保留透明通道而未采用；最终资产在原始 RGBA 源图上执行确定性色相替换，完整保留 512×512 画布、透明度、纸边、铅笔线、纹理和所有特效轮廓。
- 运行时派生图仍为 `assets/games/doodle-jump/visual/effects/spring-rebound.png`，由既有处理脚本按 Alpha 紧边生成，不新增资源路径或跨游戏依赖。

## 大厅 4:3 玩法封面 v2（当前，2026-09-01）

- 生成方式：Codex 内置 `image_gen`，以本游戏正式主角、Normal 平台、珊瑚红弹簧和 Small 怪物为视觉参考，不引用大厅或其他小游戏的正式美术。
- 采用输出：`exec-b05b47c5-3e43-4681-bc47-4b32559b5f67`；原始 1448×1086、严格 4:3 输出归档为 `art_sources/涂鸦跃层/大厅/lobby_cover.png`，运行时以 192 色调色板和 Lanczos 缩放派生为 `assets/lobby/visual/covers/doodle-jump/lobby-cover.png`（800×600）。
- 构图以向上跃动的主角和自下而上的平台路线为主体，同时展示弹簧、护盾、纸飞机与独眼怪物；关键元素保持在中央安全区，适配大厅卡片 `cover` 裁切。封面不包含 HUD、文字、Logo 或其他游戏素材。

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
- 用于追溯的过期候选仍保留在 `art_sources`，但未被运行时路径引用；2026-08-31 清理无消费者资源后按新增规则页需求恢复了本游戏正式空白规则面板，`visual` 当前共有 117 张 PNG；其余 12 张旧派生图保持移除，并已从处理脚本删除对应输出映射。缺失的主体图会进入本游戏自有资源缺失页，不退回代码色块游玩。
