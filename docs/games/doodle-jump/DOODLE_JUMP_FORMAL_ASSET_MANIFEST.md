# 《涂鸦跃层》正式资源清单

## 1. 资源边界

- 源素材唯一根目录：`art_sources/涂鸦跃层/`。
- 游戏运行时派生目录：`assets/games/doodle-jump/visual/`，属于 `game-doodle-jump` Bundle。
- 大厅仅使用 `assets/lobby/visual/icons/doodle-jump/` 和 `assets/lobby/visual/covers/doodle-jump/` 中的展示副本，不加载游戏 Bundle 图片。
- 运行时不使用总览板、效果图或整张 sheet 作为界面；所有对象均使用独立 RGBA 派生图。

## 2. 交付分组

| 分组 | 运行时目录 | 交付内容 | 运行时基准 |
| --- | --- | --- | --- |
| 主角 | `visual/player/` | 基础跳跃、独立落地帧、Jetpack、Propeller Hat、Rocket、Shield Overlay | 落地帧双脚站稳平台并与基础跳跃图共用脚底基线；逻辑碰撞体不随图片变化 |
| 平台 | `visual/platforms/` | Normal、Moving、Breakable、Disappearing、Shifting、Exploding，含 Breakable 左右半片 | 中心锚点，逻辑顶面始终为落地基准；软影预烘焙进 RGBA |
| 怪物 | `visual/enemies/` | Small/Large/Hover 各2 帧 | 同类两帧共享画布、缩放和底部中心锚点；地面怪可见脚底对齐平台逻辑上沿 |
| 危险物 | `visual/hazards/` | UFO/光束/锁定/束缚、黑洞环/核心、捕兽夹/闪光 | 主体中心锚点；光束从 UFO 底部向下展开；捕兽夹底边对齐平台顶面 |
| 道具 | `visual/items/` | Spring、Trampoline、Jetpack、Propeller Hat、Rocket、Shield | 中心锚点，使用逻辑拾取半径；生成后保持固定世界坐标，不跟随平台或做上下浮动 |
| 投射物 | `visual/projectiles/` | 纸飞机、瞄准点、拖尾和命中图 | 纸飞机中心沿速度方向旋转；拖尾位于局部 -X |
| 特效 | `visual/effects/` | 落地、拾取、命中/击杀、上升/下坠/穿屏、飞行能力、护盾、复活和失败 | 特效不参与碰撞；较强副特效可按设备档位关闭 |
| 背景 | `visual/backgrounds/` | 四张纵向无缝底图、三张过渡图、四套共十六张独立装饰小图 | 底图 cover 铺满并 Repeat；四段装饰按主题隔离并按 seed 散布，不使用整张循环装饰层 |
| UI | `visual/ui/` | 分数/高度完整 HUD 卡、持续道具进度条、道具图标、教程图、全部覆盖面板 | 分数/高度卡保留完整素材构图；仅无内部构图的面板使用九宫格；动态数值不烘入图片 |

## 3. 导入、图集与压缩策略

- `tools/process-doodle-jump-visuals.py` 负责 Alpha 紧边、角色/怪物帧归一、平台图片阴影和背景无缝派生。
- `tools/configure-doodle-jump-textures.mjs` 在 Cocos 完成导入后统一设置线性采样、关闭 mipmap；透明 Sprite 使用 Clamp-to-edge 和 Alpha 边缘修复，无缝背景保留 Repeat。
- 本游戏保留 Cocos `DynamicAtlasManager` 运行时预算，图集尺寸为 1024；low/medium/high 分别最多使用 2/3/4 张，最大入图帧为 180/256/384 px。由 Bundle `Texture2D` 动态包装的正式 SpriteFrame 不进入动态图集，避免微信真机在 ImageAsset 原生数据回收后重新读取纹理尺寸；大背景和超限面板同样不进入动态图集。
- 动态图集的全局参数在进入游戏时备份，`dispose()` 时恢复，不影响大厅或其他小游戏。
- 微信最终纹理压缩由构建档案统一决定；纸张纹理和线稿优先保留线性清晰度，不对透明细线使用破坏性强压缩。

## 4. 序列帧与运行时动画

- 怪物：同类 01/02 以 6 fps 交替，每个实例使用独立 phase，避免全屏同步。
- 主角：水平方向翻转；上升不覆盖速度线，下坠显示缩小且靠近角色中部的拖痕；穿屏时播放短暂残影。
- 能力：Jetpack、Propeller Hat、Rocket 使用完整角色组合图，同时播放主推进特效；medium/high 额外显示纸屑、旋转线或拖尾，low 保留主体和主反馈。
- 平台：Breakable 先显示裂纹再分为两半下坠；Disappearing 纸屑淡出；Shifting 只移动平台本体，不覆盖方向运动线；Exploding 使用倒计时环和爆裂碎片。
- 危险/失败：UFO 光束、锁定和束缚分层；黑洞外环/核心反向旋转；捕兽夹触发闪光；普通掉落、UFO、黑洞和捕兽夹分别使用独立失败图。
- UI：medium/high 面板使用 160ms 纸片弹入与 120ms 淡入；low 立即显示，不缩减文字或按钮。

## 5. 预留音频 Cue

本阶段不包含正式音频文件。`BundleAudioBank` 已以 optional 方式登记以下 Bundle 路径，文件缺失时不报错、不显示错误页且不阻断游戏：

- BGM：`audio/doodle-jump-paper-loop`
- UI：`audio/ui-paper-button`
- 玩法：`paper-plane-shot`、`platform-land`、`impact`、`monster-defeat`、`item-pickup`、`hazard-warning`、`run-failure`、`resurrection`、`new-record`

正式音频补齐后只需按上述路径导入本 Bundle，不需要修改玩法逻辑。
