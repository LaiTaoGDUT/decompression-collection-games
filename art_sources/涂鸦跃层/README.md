# 涂鸦跃层素材暂存区

本目录是《涂鸦跃层》进入 Cocos 资源前的正式源素材归档区。运行时不直接修改或引用这些原图，而是由处理脚本生成到本游戏 Asset Bundle 中的派生图。

## 来源与处理

- 生成日期：2026-08-28。
- 生成方式：Codex 内置 `image_gen`；生成提示词以 `docs/games/doodle-jump/DOODLE_JUMP_IMAGE_PROMPTS.md` 为基线，并使用项目内纸片涂鸦参考图。
- 主角原始图：`art_sources/涂鸦跃层/主角/ChatGPT Image 2026年8月27日 18_00_43.png`。
- 视觉参考：`art_sources/涂鸦跃层/flat-paper-ui-reference-v1.png`、`art_sources/涂鸦跃层/game-asset-overview-v2.png`。
- 主角原图中的 5 个组件已分别抠出、统一为 512×512 RGBA，并使用共同底部基准线；包含站立、运行时原型姿势、Rocket、Jetpack、Propeller Hat 三张组合图。
- 透明素材已清理生成图中的棋盘格/底色，并按固定图集格序拆出独立 PNG；背景、封面统一为 1080×1920，游戏图标为 512×512。
- 运行时不直接使用带透明留白的 512×512/512×256 源画布；`tools/process-doodle-jump-visuals.py` 会按 Alpha 包围盒加抗锯齿保护边生成裁边派生图，并保留本目录原图不变；六类平台分别生成自带透明柔和软影的 `*-shadowed-v2.png`，运行时不再添加独立阴影节点。
- 2026-08-30 新增 `背景/seamless_sources_v2/` 三张可追溯生成源图，但因运行效果偏脏已停止用于 Bundle；当前处理脚本以原有三张正式背景为输入，输出三套纵向无缝底图和两张主题过渡图，并把现有 `background_decor/` 素材裁边后作为运行时随机散布的小装饰图，不再合成整张循环装饰层。
- `player_ready_standing.png` 只作为历史源素材保留；当前玩法已移除 Ready，Bundle 只导入运行时跳跃姿势。
- 阶段 7 已把基础运行图与 Rocket、Jetpack、Propeller Hat 三张组合图放入同一尺寸的底部中心对齐画布；`shield_overlay.png` 独立裁边后作为玩家子节点叠加。六种 `道具/pickups/` 及 `特效/common_vfx`、`特效/item_motion_vfx` 中实际使用的能力反馈也由同一脚本裁边派生到本游戏 Bundle，源图保持不变。
- 阶段 9 已将 `UI/hud_components/`、`UI/overlay_panels/`、`UI/tutorial_illustrations/` 及道具 HUD 图标按 Alpha 紧边派生到 `assets/games/doodle-jump/visual/ui/`；源图的纸边、线稿和软影保持不变。
- 阶段 10 已把原先未入 Bundle 的上升/下坠/穿屏、投射物拖尾、飞行能力副特效、护盾/复活脉冲、平台裂纹/运动线及普通掉落失败图紧边派生到本游戏 Bundle；本阶段未增加新生成图。
- 动态文字、数字、分数、米数、按钮文案没有烘焙进素材，留给运行时绘制。
- 生成原图保留在本机 `/Users/laitao/.codex/generated_images/01a0465c-7049-7c71-9678-1a09dd0f4ea4/`，便于追溯；最终候选文件只使用本目录中的清理版本。

## 图集格序

| 文件 | 格序 |
| --- | --- |
| `投射物/paper_plane_projectile_sheet.png` | paper plane、aim reticle、projectile trail、projectile hit |
| `道具/item_pickups_and_icons_sheet.png` | 前两行是 spring、trampoline、jetpack、propeller hat、rocket、shield、head start、resurrect 拾取物；后两行是同序 HUD 图标 |
| `平台/platform_base_sheet.png` | normal、moving、breakable、disappearing、shifting、explosive |
| `平台/platform_state_vfx_sheet.png` | breakable cracks、disappearing fade、shifting motion、explosive countdown、explosion fragments |
| `敌人/enemy_sheet.png` | small 01/02、large 01/02、hover 01/02 |
| `危险物/hazard_sheet.png` | UFO、tractor beam、lock target、tractor tether、black-hole ring、black-hole core、bear trap、trigger flash |
| `特效/item_motion_vfx_sheet.png` | Rocket scraps、Rocket flame、Rocket trail、Jetpack flames、Jetpack scraps、propeller rotation、propeller airflow、shield pulse、spring rebound、trampoline rebound、head-start burst、resurrection pulse |
| `特效/common_vfx_sheet.png` | ascent、fall drag、screen wrap、pickup、paper-plane hit、enemy defeat、shield block、landing rebound、near miss |
| `特效/failure_vfx_sheet.png` | falling、enemy contact、UFO capture、black-hole suction、bear-trap trigger、explosive-platform failure |
| `背景/background_decor_sheet.png` | pencil line、sticky note、torn edge、stair line、folded page、clouds、floating scraps、danger lines、blank warning sticker、star、route segment、scattered paper |
| `UI/hud_components_sheet.png` | score card、height card、pause、shield status、flying-item frame、time bar、pickup bubble、sensor error bar、retry、back、share、play again |
| `UI/overlay_panels_sheet.png` | loading、sensor calibration、ready、pause、rules、sensor error、revive confirmation、results、missing resource |
| `UI/tutorial_illustrations_sheet.png` | sensor tilt、paper-plane shot、hazard symbols |

独立 PNG 位于相应图集旁的子目录中；主角独立 PNG 位于 `主角/`，背景与大厅素材位于 `背景/`、`大厅/`。
