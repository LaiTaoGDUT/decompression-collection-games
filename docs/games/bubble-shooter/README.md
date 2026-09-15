# 泡泡龙设计接续入口

最后整理：2026-09-15。来源：用户与助手的逐步设计讨论。

## 最新交付范围（2026-09-13）

用户要求先完成只有云端的完整游戏，其他区域暂缓。当前实现与验收以 [云端单场景清单](SINGLE_SCENE_STATUS.md) 为准：已补齐云端布局/难度成长、糖屑/去霜反馈、存档续局和空音频播放逻辑。[24 项音频提示词](AUDIO_PROMPTS.md)已提供，实际音频由用户后续提交；真实微信广告与真机验收按用户要求暂缓。下文带日期的进度属于历史记录，不能据此把已完成项误判为待做。

## 当前状态

本游戏已进入正式接入阶段。已确认核心循环、四区域机制、道具、复活和云端软糖主界面视觉方向；云端软糖的加高背景、顶部/底部场景层、四色泡泡、糖霜、发射器、HUD、道具和 Boss 分层均已有合理尺寸的运行时候选。资源 Bundle `game-bubble-shooter-assets`、逻辑 Bundle `game-bubble-shooter`、`BubbleShooter` 场景和 `BubbleShooterGame` 生命周期入口均已建立。当前工作区 Manifest 为 `enabled: true`；本轮保留该已有配置。微信真机验收尚未完成。

正式标识已冻结：显示名“泡泡龙”，`gameId` 为 `bubble-shooter`，逻辑 Bundle 为 `game-bubble-shooter`，远程资源 Bundle 为 `game-bubble-shooter-assets`，场景计划为 `scenes/BubbleShooter`，入口组件计划为 `BubbleShooterGame`。

用户最后确认的是：宽体布丁王与较高棋盘布局合并后的最终构图方向。用户随后要求先把全部讨论结果固化到项目，便于任何时候继续。

2026-09-11 用户已确认 [加高天空云海 v2](art-source/cloud/background-tall-v2.png)，要求后续素材干净、减少噪点。内置生图工具一度把透明预览棋盘格写入 RGB 像素；用户随后明确要求先继续生成原图，透明问题统一后处理。当前云端软糖主界面清单中的独立物件已经全部完成真实透明、裁切和合理尺寸处理，带棋盘格的原图只保留为来源记录，不能用于运行时。v1 背景只留构图参考。最终尺寸、九宫格和资源路径见 [运行时素材规范](runtime-source/README.md)。

最新实现：云端单场景已完成背景 cover、短屏缩放、棋盘、炮台转向与换球、发射、反弹、吸附、消除、糖霜、掉落、补行、供球保护、三个道具、Boss、奖励、复活、暂停、结算、存档续局和空音频播放逻辑；完整功能边界见 [接入记录](INTEGRATION.md) 与 [单场景清单](SINGLE_SCENE_STATUS.md)。其他三个区域仍待接入。

2026-09-12：弹窗采用四区域共享主体 + 场景独立标题/Boss/装饰。用户明确喜欢奖励 v1 的奶油面板与粉色控件，v2 白紫主题不采用；用户要求进一步删除通用主体云朵轮廓，[去云朵通用主体 v4](references/shared-reward-clean-base-draft-v4.png)已出图，**v4 已确认，7 张透明素材已处理并导入，奖励界面与交互已接入**。

2026-09-12：[复活与结算效果图 v2](references/shared-revive-result-draft-v2.png)**已获用户确认，通用素材已拆分并完成复活/结算接入**。用户补充要求复活、结算、暂停也像奖励一样叠加各场景专属样式/素材；v2 为基础确认稿，用户要求 Boss 像奖励页一样盖在弹窗顶部；[Boss 叠顶组合 v2](references/cloud-revive-result-boss-draft-v2.png)已获用户确认并已实现，零散云团/糖果方案不采用。

## 阅读顺序

最新接续（2026-09-11）：用户已确认素材没有问题，44 张运行时 PNG 已逐字节复制到独立远程资源 Bundle [`assets/game-assets/bubble-shooter`](../../../assets/game-assets/bubble-shooter/)，源文件与 Bundle 文件 SHA-256 全部一致。大型背景、浮岛和 Boss 保持独立；泡泡、发射器、HUD、道具和 VFX 分别建立五个 Auto Atlas。所有 PNG 已导入为 SpriteFrame、关闭 mipmap并使用 `clamp-to-edge`；两张 Boss 血条 SpriteFrame 已写入 48/32 九宫格边界。逻辑 Bundle、750 × 1334 场景、正交 UI 相机和统一生命周期入口也已建立；Manifest 暂时禁用该入口。完整路径约定见[正式接入记录](INTEGRATION.md)。

1. [玩法与流程基线](DESIGN.md)：当前有效规则、四区域、奖励、供球、死亡与复活。
2. [视觉与素材制作基线](VISUAL.md)：适配例外、最终图、素材拆分计划、视觉验收。
3. [待定事项与废弃方案](DECISIONS.md)：后续从哪里继续，哪些旧设计不能恢复。
4. [正式接入与资源路径](INTEGRATION.md)：冻结标识、Bundle 边界、运行时素材目录和下一接入步骤。
5. 项目根目录 [AGENTS.md](../../../AGENTS.md) 与 [公共架构](../../common/ARCHITECTURE.md)。

## 已确认效果图

| 文件 | 用途与状态 |
| --- | --- |
| [普通阶段](references/cloud-normal-approved.png) | 普通界面参考；用糖珠槽替换文字补行提示，后续用户要求延续此版制作 Boss |
| [Boss 最终构图](references/cloud-boss-composition-approved.png) | **当前 Boss 视觉主依据**：宽体、大脸、双拳；用户确认整体比例；仍需修复皇冠裁切及坐标偏差 |

PNG 已复制到项目文档目录，不依赖聊天窗口或个人生成图片缓存。它们是设计参考，不是可以直接放入运行时的整屏素材，不进入 `assets` 打包。

## 接续原则

- 不重复询问已确认决定；如果要改变，说明影响并取得对应新决定。
- 已确认方向不等于数值已锁定。图上三个计数槽、血量比例、泡泡排列均不能直接当作平衡数据。
- 用户会继续讨论完整游戏；不要因为一张主界面获批就开始实现所有区域和页面。
- 就云端软糖而言，Fit Width、素材接入、棋盘规则和 Boss 战斗原型已经完成；后续以接入记录末尾的下一步为准。
- 每次新确认后同步更新这些文档和参考图状态，避免只存在于聊天记录。

## 项目接入约束

Cocos Creator 3.8.8、微信小游戏、750 × 1334、Fit Width。App.scene 唯一启动，MiniGame 生命周期、GameSession、MiniGameContext、ServiceContainer、AssetService 与应用状态机遵循根 AGENTS.md。四区域属于同一小游戏内容，不是四个独立小游戏；实际区域资源组织和换景实现尚未设计，不得绕开核心加载/释放架构。

素材以静态图与代码动画为主。正式资源位于 `assets/game-assets/bubble-shooter`，只包含视觉资源，不放脚本、场景或 Prefab；后续逻辑与场景位于 `assets/games/bubble-shooter`。代码验证至少 TypeScript 无错误、git diff --check；每次改动后用 cocos_creator_stdio 刷新资源。禁止 Map/Set 迭代器展开，使用 Array.from 或显式遍历。

2026-09-12：已确认并接入[云端暂停弹窗 v1](references/cloud-pause-draft-v1.png)，采用浅白通用主体 + Boss 叠顶，提供继续游戏、重新开始、返回大厅。

暂停 v1 已获用户确认并完成运行层回调接入，复用现有素材。最终复活/暂停面板宽 580，暂停按钮宽 485，主/次按钮高 110/92，边缘间距 24。

最新接续：暂停最终版已获用户确认。当前继续深海微光普通/章鱼 Boss 的场景接入，详见 [深海评审](OCEAN_REVIEW.md)。
