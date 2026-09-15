# 泡泡龙运行时素材暂存规范

更新：2026-09-11。

本目录保存从 `art-source` 母版裁切、抠图和降采样后的运行时来源文件。母版保持原始分辨率用于返工；游戏不得直接导入 1000～2200 像素的生成母版。显示名“泡泡龙”、`gameId: bubble-shooter` 和资源 Bundle `game-bubble-shooter-assets` 已冻结，本目录中通过检查的 44 张 PNG 已复制到 [`assets/game-assets/bubble-shooter/visual`](../../../../assets/game-assets/bubble-shooter/visual/)；本目录继续作为可追溯的迁移来源，不由运行时代码加载。

尺寸以 750 × 1334 Cocos 设计坐标为基准。普通 UI 和棋子通常保留约 2 倍最大显示尺寸，小粒子保留约 3～4 倍显示尺寸；这是纹理像素，不是节点设计尺寸。Cocos 节点仍按设计坐标设置宽高。

## 已输出

| 文件 | 运行时纹理 | 建议最大显示尺寸 | 枢轴/切片 | 状态 |
| --- | ---: | ---: | --- | --- |
| [background.png](cloud/background.png) | 750 × 1800 RGB | cover 全屏 | 中心；禁止九宫格 | 已按批准背景比例归一 |
| [attack-energy-heart.png](cloud/attack-energy-heart.png) | 96 × 96 RGBA | 24 × 24 | 中心 | 已裁切、降采样 |
| [attack-candy-shards.png](cloud/attack-candy-shards.png) | 256 × 256 RGBA | 仅作为拆分来源 | 不直接实例化 | 已拆成 [八张独立 PNG](cloud/attack-candy-shards/) |
| [boss-pudding-body.png](cloud/boss-pudding-body.png) | 1024 × 512 RGBA | 720 × 360 内 | 约 `(0.5, 0.06)`，靠近可见底边 | 已提取 Alpha、等比裁切、降采样；表情留在身体层 |
| [boss-pudding-fist-left.png](cloud/boss-pudding-fist-left.png) | 384 × 320 RGBA | 240 × 200 内 | 约 `(0.90, 0.52)`，右侧连接端 | 已重新提取 Alpha，已清除旧版外发光 |
| [boss-pudding-fist-right.png](cloud/boss-pudding-fist-right.png) | 384 × 320 RGBA | 240 × 200 内 | 约 `(0.10, 0.52)`，左侧连接端 | 已提取 Alpha；保留独立光照，不镜像左拳 |
| [boss-pudding-crown.png](cloud/boss-pudding-crown.png) | 320 × 256 RGBA | 180 × 144 内 | 约 `(0.5, 0.08)`，皇冠底部中心 | 已提取 Alpha；顶部和两侧留有透明安全边距 |
| [hud-down-arrow.png](cloud/hud-down-arrow.png) | 128 × 128 RGBA | 48 × 52 | 中心 | 已裁切、降采样 |
| [hud-frosting-skill.png](cloud/hud-frosting-skill.png) | 160 × 176 RGBA | 64 × 70 | 中心 | 已裁切、降采样 |
| [item-button-base.png](cloud/item-button-base.png) | 320 × 288 RGBA | 144 × 130 | 中心；文字独立 | 已裁切、降采样 |
| [item-count-badge.png](cloud/item-count-badge.png) | 96 × 96 RGBA | 40 × 40 | 中心；数字独立 | 已裁切、降采样 |
| [bubble-red.png](cloud/bubble-red.png) | 160 × 160 RGBA | 80 × 80 | 中心；严格内接圆，四向顶边 | 解析圆形 Alpha；有效边界等于完整画布 |
| [bubble-yellow.png](cloud/bubble-yellow.png) | 160 × 160 RGBA | 80 × 80 | 中心；严格内接圆，四向顶边 | 解析圆形 Alpha；有效边界等于完整画布 |
| [bubble-blue.png](cloud/bubble-blue.png) | 160 × 160 RGBA | 80 × 80 | 中心；严格内接圆，四向顶边 | 解析圆形 Alpha；有效边界等于完整画布 |
| [bubble-purple.png](cloud/bubble-purple.png) | 160 × 160 RGBA | 80 × 80 | 中心；严格内接圆，四向顶边 | 解析圆形 Alpha；有效边界等于完整画布 |
| [frosting-overlay.png](cloud/frosting-overlay.png) | 160 × 160 RGBA | 80 × 80 | 中心；与四色泡泡完全同画布 | 已同步裁切；四色叠层检查通过 |
| [frosting-debris.png](cloud/frosting-debris.png) | 256 × 256 RGBA | 仅作为拆分来源 | 不直接实例化 | 已拆成 [七张独立 PNG](cloud/frosting-debris/) |
| [launcher-pedestal.png](cloud/launcher-pedestal.png) | 384 × 256 RGBA | 192 × 128 | 约 `(0.5, 0.125)`，对准可见底边 | 已提取 Alpha、裁切、降采样 |
| [launcher-turret.png](cloud/launcher-turret.png) | 192 × 320 RGBA | 96 × 160 | 约 `(0.5, 0.10)`，对准底部珍珠轴心 | 已提取 Alpha；中心球槽透明 |
| [swap-icon.png](cloud/swap-icon.png) | 96 × 96 RGBA | 40～48 | 中心 `(0.5, 0.5)` | 已透明、裁切、降采样 |
| [hud-pause-button.png](cloud/hud-pause-button.png) | 144 × 144 RGBA | 64 × 64 | 中心；触控热区由节点扩大 | 已透明、裁切、降采样 |
| [hud-counter-slot-empty.png](cloud/hud-counter-slot-empty.png) | 96 × 96 RGBA | 40 × 40 | 中心；灰色内凹底保持不透明 | 已提取 Alpha、裁切、降采样 |
| [hud-counter-bead.png](cloud/hud-counter-bead.png) | 64 × 64 RGBA | 28 × 28 | 与空槽共用中心 | 已透明、裁切、降采样 |
| [hud-boss-health-track.png](cloud/hud-boss-health-track.png) | 192 × 96 RGBA | 高 48、宽度按布局 | 九宫格；左右 48，节点高度固定 | 对称胶囊几何；双圆头、外框、描边和灰槽连续对齐 |
| [hud-boss-health-fill.png](cloud/hud-boss-health-fill.png) | 128 × 64 RGBA | 高 32、宽度按血量 | 九宫格；左右 32，节点高度固定 | 对称胶囊几何；双圆头和中段连续对齐 |
| [item-bomb.png](cloud/item-bomb.png) | 192 × 192 RGBA | 约 80 × 88 | 中心；完整保留顶部引线 | 已提取 Alpha、等比裁切、降采样 |
| [item-wildcard.png](cloud/item-wildcard.png) | 192 × 192 RGBA | 约 80 × 80 | 中心；圆形有效区 176 × 176 | 已提取 Alpha、统一圆径 |
| [item-clear-bottom.png](cloud/item-clear-bottom.png) | 192 × 192 RGBA | 约 96 × 36 | 中心；保持横向糖果自然比例 | 已提取 Alpha、等比裁切、降采样 |
| [island-right.png](cloud/island-right.png) | 512 × 512 RGBA | 约 300 × 300 内 | 中心；独立远景节点 | 已提取 Alpha、等比裁切、降采样；瀑布柔边保留 |
| [foreground-bottom.png](cloud/foreground-bottom.png) | 750 × 320 RGBA | 750 × 320 内 | 底部中心；横向铺满 | 已提取 Alpha并贴底；中部保持低矮，不遮挡操作区 |
| [island-left.png](cloud/island-left.png) | 512 × 512 RGBA | 约 300 × 300 内 | 中心；独立远景节点 | 已去除假棋盘格并降采样；沿用无瀑布 v2 造型 |

## 独立粒子切片

当前主界面清单中的整图和粒子素材均已有合理尺寸的运行时候选。两张 256 × 256 多物件源图只用于追溯和检查，运行时实例使用下列紧凑 PNG；正式导入 Cocos 后，每张 PNG 自身生成一个 SpriteFrame。

| 模块 | 独立文件 | 画布范围 | 枢轴 |
| --- | --- | ---: | --- |
| 糖霜碎屑 | `cloud/frosting-debris/fragment-01.png` ～ `fragment-07.png` | 54 × 48 ～ 124 × 97 RGBA | 每张画布中心 `(0.5, 0.5)` |
| 红色攻击糖屑 | `cloud/attack-candy-shards/red-01.png`、`red-02.png` | 70 × 72、73 × 65 RGBA | 每张画布中心 `(0.5, 0.5)` |
| 黄色攻击糖屑 | `cloud/attack-candy-shards/yellow-01.png`、`yellow-02.png` | 66 × 75、68 × 62 RGBA | 每张画布中心 `(0.5, 0.5)` |
| 蓝色攻击糖屑 | `cloud/attack-candy-shards/blue-01.png`、`blue-02.png` | 79 × 67、66 × 66 RGBA | 每张画布中心 `(0.5, 0.5)` |
| 紫色攻击糖屑 | `cloud/attack-candy-shards/purple-01.png`、`purple-02.png` | 63 × 64、70 × 63 RGBA | 每张画布中心 `(0.5, 0.5)` |

每张切片保留原始运行时源图像素，不做二次放大或降采样；轮廓四周保留 4 像素透明边距。糖霜碎屑可进入糖霜反馈 Atlas，四色攻击糖屑可进入攻击反馈 Atlas，两组不机械合并成同一个图集。

淘汰的 `launcher-base-v1`、拳头 v1、背景 v1 和两张 Boss 合成审查图不制作运行时副本。

## 图集与导入

- 普通球和糖霜覆盖层属于同一棋盘模块，可进入同一个 Auto Atlas。
- HUD 小图、道具控件和攻击反馈分别按模块建图集，不跨模块机械合并。
- Boss 血条轨道使用 `Sprite.Type.SLICED`，左右边界各 48 像素；填充条左右边界各 32 像素。两者只改变中段宽度，节点高度分别固定为 96 和 64 纹理像素对应的设计高度。
- 填充条位于轨道图上方、灰色内槽范围内。满血时保留左右内缩；血量变化通过九宫格节点宽度配合裁切遮罩表现，零血量直接隐藏，不能用普通 `scaleX` 压扁端帽。
- 750 × 1800 背景、Boss 身体、浮岛和底部前景不进入小图集。
- Cocos 导入后需要关闭不必要的 mipmap；像素格式和压缩质量在真机观察透明边缘及颜色带后决定，不能只看浏览器预览。
