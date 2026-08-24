# 《无尽剑域》产品与开发计划

> 状态：草案（评审通过后冻结，冻结前不改核心加载流程与公共协议）
> 制定日期：2026-08-22
> 策划基线：[《无尽剑域》竖屏无尽割草 Roguelike 游戏策划案 V1.0](./《无尽剑域》竖屏无尽割草 Roguelike 游戏策划案 V1.0.md)（已含 2026-08-22 修订：11 主动技能、无槽位上限、灾厄 2 分钟一档、精英吃时间倍率、Boss 只用自身公式、天道宝箱规则、魂虫/鬼火怪衍生敌人）
> 架构基线：[ARCHITECTURE.md](./ARCHITECTURE.md) / [AGENTS.md](../AGENTS.md)
> 视觉规范：`ENDLESS_SWORD_VISUAL_SPEC.md`（M0 产出，正式素材前置条件）
> 计划惯例参考：[SLIDING_PUZZLE_PLAN.md](./SLIDING_PUZZLE_PLAN.md)

---

## 0. 当前进度

t1.5 完成

## 1. 目标与范围

在合集中新增竖屏无尽割草 Roguelike 小游戏《无尽剑域》：单手浮动摇杆移动，攻击全自动，升级三选一构筑 Build，5 分钟一届天劫 Boss 触发技能进化，15 分钟起灾厄无限叠加，唯一目标是更高分 / 更长生存 / 更高天劫重数。

- **范围**：策划案 V1.0 全量（11 主动技能、8 心法、11 进化、9+2 普通敌人、3 精英、5 Boss、天机灵珠、境界、灾厄、玄境、广告复活一次）。
- **不做**：策划案 §133 清单（局外养成、装备、抽卡、手动技能、角色选择、胜利条件等），以及跨会话局内进度恢复（暂停只在局内恢复，退出即结算）。
- **成功标准**：
  1. P0 阶段证明割草核心好玩（5 分钟一局仍有"再来一局"动力）；
  2. 策划案 §104 性能预算在低端真机达标（160 敌人 + 160 投射物 + 80 VFX 稳定帧率）；
  3. 策划案 §134 自动化测试用例全部通过；
  4. 大厅进出、暂停、重开、复活、退出、二次进入全链路无泄漏、无重复 Session。

## 2. 关键决策（已随策划案定稿，开发不得偏离）

| 项目 | 决策 |
| --- | --- |
| GAME_ID / Bundle | `endless-sword` / `game-endless-sword`（独立场景、独立 Bundle、独立微信分包） |
| 技能体系 | 11 主动 + 8 心法，全部可获得，**无槽位上限**；主动与心法均 Lv1→Lv5 |
| 进化 | 技能 Lv5 + 对应心法 Lv5 + 拾取天道宝箱；宝箱规则见策划案 §29（30 秒存在、到期自动飞拾、场上最多 2 个） |
| 玄境 | 全部 11+8 项 Lv5 后开启（预期 35～50 分钟），无限叠加成长 |
| 灾厄 | 15:00 起每 **2 分钟**一档，约 73:00 全 V 层，约 75:00 起终末劫 |
| 数值边界 | 普通/精英吃 §54 时间倍率（精英另吃魔化）；Boss 只用 §47/§48 自身公式 |
| 广告 | 仅"每局一次复活"；先检查 `AdService.isEnabledForGame(gameId)`，再以专属 placement、`gameId`、`sessionId` 调用 `showRewarded(request)`，成功/跳过/失败三态都要处理 |
| 局外 | 无永久养成；存档只存最高纪录 + 设置 + 新手标记 |
| 可见性 | M0～M3 `visibility: "development"`，M4 起评估切 `public` |
| 视觉 | 独立风格单元（动漫国风仙侠 + 高饱和特效 + 深色战场），先写 VISUAL_SPEC 再产正式素材，禁止复用其他游戏皮肤 |

## 3. 里程碑总览

估算口径：一名熟悉本仓库的开发者全职投入；"工日"为纯开发日。素材生成等待时间可与开发并行，不计入关键路径。

| 里程碑 | 目标 | 出口标准（全部满足才进入下一个） | 预估 | 关键依赖 |
| --- | --- | --- | --- | --- |
| M0 立项与脚手架 | Bundle/场景/清单/生命周期空跑 + 视觉规范 | 大厅进出 10 次无报错无泄漏；`tools/verify-game-bundles.js` 通过；VISUAL_SPEC 初稿完成 | 2 工日 | 无 |
| M1 P0 核心可玩 | 割草核心循环（策划案 §122 全项） | §128 前 5 分钟验收达标（Lv15～20、4 技能 4 心法、首 Boss 20～45 秒击杀）；Restart/Dispose 干净 | 7 工日 | M0 |
| M2 P1 完整玩法 | 策划案 §123 全项 | 全技能/全敌人/全 Boss/灵珠/境界/灾厄/玄境/复活可用；§134 生命周期与 Gameplay 用例通过 | 12 工日 | M1 |
| M3 性能硬化 | 策划案 §104/§105/§106 全项落地 | 压力场景（160/160/80/80 持续 10 分钟）真机无内存持续增长、无明显掉帧 | 4 工日 | M2（对象池/网格可在 M1 提前做基础版） |
| M4 正式美术与音频 | P2 表现层替换（策划案 §124） | 全部占位素材替换为正式素材并完成来源/许可记录；演出（震屏/白闪/Boss 出场/突破/灾厄）接入 | 8 工日（素材生成并行） | VISUAL_SPEC 冻结；M2 |
| M5 QA 与验收 | P3（策划案 §125） | §134 全部用例绿；多机型 SafeArea；Seed Replay；数值曲线复核 | 5 工日 | M3 + M4 |
| M6 发布 | 上线公开 | `visibility: "public"`；微信分包大小校验通过；真机全流程回归；素材验收记录归档 | 1 工日 | M5 |

关键路径合计约 **39 工日**；素材生产（M4 的 8 工日中约 5 工日是生成/导入/验收，可提前到 M2 期间并行启动）。

## 4. 技术方案

### 4.1 Bundle 与清单注册

不改动任何核心加载代码，全部通过 Manifest 注册（AGENTS 架构边界）：

1. 新建 `assets/games/endless-sword/`，folder meta 参照 `assets/games/twenty48.meta` 写入 `userData`：`isBundle: true, isSubpackage: true, bundleName: "game-endless-sword", bundleConfigID: "00mTKQ64hMUZEoY95Dbj9L", priority: 1`（bundleConfigID 必须用此固定值，`tools/verify-game-bundles.js` 会校验）。
2. `assets/resources/configs/games.json` 追加条目（字段格式对照现有条目）：

```json
{
  "id": "endless-sword",
  "version": "1.0.0",
  "name": "无尽剑域",
  "description": "单手御剑，无尽割草。构筑流派，挑战天劫重数。",
  "bundle": "game-endless-sword",
  "scene": "scenes/EndlessSword",
  "entryComponent": "EndlessSwordGame",
  "icon": "visual/branding/lobby-cn-title-logo-v3/texture",
  "cover": "visual/backgrounds/lobby-arcade-warm-rays-v3/texture",
  "orientation": "portrait",
  "renderMode": "2d",
  "minimumDeviceTier": "low",
  "enabled": true,
  "visibility": "development",
  "preload": [],
  "tags": ["action", "roguelike", "endless"]
}
```

3. 大厅封面与图标是"大厅展示副本"，放 `assets/lobby/visual/covers/endless-sword/`、`assets/lobby/visual/icons/endless-sword/`（lobby Bundle 内）。M0～M3 期间允许开发占位图。
   当前 `games.json` 使用 `lobby-cn-title-logo-v3` 与 `lobby-arcade-warm-rays-v3` 作为开发期占位；M4 前必须替换为无尽剑域专属展示副本，并补齐来源/许可记录。
4. 场景加入 bundle 后构建器自动收集，无需改 `profiles`。

### 4.2 目录结构

```text
assets/games/endless-sword/
  scenes/
    EndlessSword.scene            # 唯一入口场景；Canvas 显式绑定 UI Camera
  scripts/
    EndlessSwordGame.ts           # 入口组件，@ccclass('EndlessSwordGame') implements MiniGame<EndlessSwordServices>
    EndlessSwordTypes.ts          # RunState、GameplayEvent、结算载荷等类型
    config/                       # 纯数据，无逻辑，禁止在系统里散落魔法数
      GameConfig.ts               # §10/11/12/13：玩家属性、碰撞、XP 公式、摇杆参数
      SkillConfig.ts              # 11 主动 + 8 心法 + 11 进化 + 玄境池 + 升级权重
      EnemyConfig.ts              # 9 普通怪 + 魂虫/鬼火怪 + 3 精英（特殊行为参数）
      BossConfig.ts               # 5 Boss：类型倍率、HP/伤害公式参数、技能循环
      DifficultyConfig.ts         # 刷怪速率表、敌人构成表、时间成长、灾厄表、终末劫
      DropConfig.ts               # 掉落概率、灵露/聚灵符、天机灵珠六种、XP 合并
    core/
      RunModel.ts                 # 单局全部可变状态（可序列化，供 QA 快照）
      PlayerModel.ts / EnemyModel.ts / SkillModel.ts
      SeededRandom.ts             # mulberry32 或同级；runSeed 驱动全部玩法随机
      SpatialHashGrid.ts          # 128×128 cell；插入/查询/清帧
      ObjectPool.ts               # 通用池：预热的上限、借还统计（泄漏检查用）
      GameLoop.ts                 # 固定时间步调度（见 4.4）
    systems/                      # 只读写 Model，不持节点引用
      PlayerSystem.ts  EnemySystem.ts  SpawnSystem.ts  SkillSystem.ts
      ProjectileSystem.ts  CollisionSystem.ts  ExperienceSystem.ts
      UpgradeSystem.ts  DifficultySystem.ts（含灾厄）  BossSystem.ts
      TianjiOrbSystem.ts  ScoreSystem.ts
    view/                         # 订阅 Model 差异，纯表现
      WorldBackground.ts          # 3×3 循环 Tile
      CameraRig.ts                # 跟随 + 震屏（上限 16px）
      FloatingJoystick.ts
      PlayerView.ts / EnemyView.ts / ProjectileView.ts / VfxView.ts
      DamageNumberView.ts         # 30 个池化，只显示暴击/精英/Boss
    ui/                           # 自绘正式视图（禁止用 shared 皮肤当正式 UI）
      Hud.ts  UpgradeOverlay.ts（升级与宝箱进化共用三选一框架）
      PauseOverlay.ts  ResultOverlay.ts  ReviveOverlay.ts
    save/
      EndlessSwordSave.ts         # 读写 GameSaveData.custom + 版本迁移
    debug/
      EndlessSwordDebugBridge.ts
  visual/
    audio/  tiles/  player/  enemies/  elites/  bosses/
    projectiles/  vfx/  ui/  icons/
```

### 4.3 生命周期与状态机映射

入口实现 `MiniGame` 全部方法 + 自绘暂停/结算两个可选 UI 方法（AGENTS：正式视图必须在游戏 Bundle 内实现）：

| Runtime 调用 | RunState | 行为 |
| --- | --- | --- |
| `initialize(context)` | idle → ready | 预加载 Bundle 内配置与占位资源、构建世界根节点、安装 Debug Bridge；10s 超时由 GameRuntime 兜底 |
| `begin()` | ready → playing | `runSeed = timestamp`，启动 GameLoop 与 BGM01 |
| `pause()` / `showPauseMenu(model)` | playing → paused | 停 RunTimer/AI/投射物/技能计时/刷怪/Boss/Tween/输入；BGM 按 AudioService 暂停规范 |
| `resume()` / `hidePauseMenu()`` | paused → playing | 恢复；若由 `model.resume()` 触发则走 Context 回调 |
| `restart(context?)` | 任意 → playing | 策划案 §114 流程（clearWorld → reset 全系统 → new runSeed → start），**不重载 Bundle** |
| 死亡 | playing → reviveOffer | 停 Gameplay，弹 ReviveOverlay；看广告 → 复活流程（§74）；放弃 → 结算 |
| 结算 | completed | 自绘 ResultOverlay；确认后 `context.requestExit(result)` |
| `dispose()` | disposed | 策划案 §115 清单逐项执行 + 卸载 Debug Bridge |

成绩上报：局内实时 `context.reportScore(score)`；死亡终局 `context.requestExit({ score, duration: 0, completed: true, extra })`（duration 会被 GameSession 覆写，不必自行计时），`extra = { reason, bossKills, realm, level, kills, maxHit, revived }`。

### 4.4 游戏循环与时间

- 逻辑固定 30Hz（`GameLoop` 累加器模式），渲染每帧插值；帧率波动不会改变玩法速度。
- 唯一时间源 `gameplayElapsedTime`：仅 `state === 'playing'` 时由逻辑步累加。Pause/升级/宝箱选择/广告/结算/切后台一律不增长。
- 暂停时停 Tween：游戏内 Tween 全部挂在世界根节点上，暂停时对该节点 `Tween.stopAllByTarget` 分组管理；表现层 Tween（UI）不受影响。
- 升级三选一、宝箱进化选择复用同一个"暂停选择"机制：入队（升级途中拾取宝箱则排队），一次只弹一个。

### 4.5 配置与系统要点

- `UpgradeSystem` 权重按策划案 §34（含灵泉并入规则、全获得后类别移除、§36 进化保底），选项生成只消费 `SkillConfig` 与 RunModel，纯函数便于单测。
- `SpawnSystem`：速率/构成/时间成长全部查 `DifficultyConfig`；敌人上限 160 时暂停生成不欠账；生成位置基于运行时 `view.getVisibleSize()` 的可视区域外环带。
- `EnemySystem` 分帧：屏幕内 + 边缘一圈全帧更新 AI/分离；屏幕外敌人隔帧更新移动、跳过特殊行为计时（计时器用逻辑时间补偿）。
- `BossSystem`：每 5 分钟按 `BossConfig` 轮转生成，前一只未死照常出下一只；Boss HP/伤害只用 §47/§48 公式。
- `ExperienceSystem`：XP 珠上限 80、180 范围合并、四级视觉，全部在逻辑层完成。
- 所有技能/敌人/Boss 行为实现为"数据驱动的行为定义 + 通用执行器"，禁止每个技能写一个 God Component。

### 4.6 性能设计（对应策划案 §104～§107）

| 措施 | 落点 |
| --- | --- |
| 对象池 | Enemy/Projectile/EnemyProjectile/XPOrb/DamageNumber/HitVFX/GroundVFX 全走 `ObjectPool`，池上限即性能预算，借还计数纳入泄漏检查 |
| 空间哈希 | 128×128 `SpatialHashGrid`；投射物/拾取/分离/AI 索敌只查当前 + 相邻 cell |
| 合批 | 同类敌人帧、投射物、VFX 各自成图集（atlas），避免 512 单图打断合批；HUD 图标一张图集 |
| 分帧 | 屏幕外敌人隔帧 AI；伤害数字/VFX 超上限时优先丢弃低优先级（普通命中） |
| 音频限流 | §98 三条限流在 AudioManager（游戏内封装，底层走 AudioService） |
| 震屏 | 幅度上限 16px，连续触发取 max 不叠加 |

### 4.7 服务接入（不得绕过 Context 直接拿容器）

| 需求 | API | 说明 |
| --- | --- | --- |
| BGM/音效 | `context.services.audio.playMusic / playEffect / pauseMusic / resumeMusic / stopMusic` | 游戏内再做一层 AudioManager 封装做限流与音色映射；BGM01 常驻、Boss 存活切 BGM02 |
| 激励视频复活 | `context.services.ads.showRewarded({ placement, gameId, sessionId }): Promise<AdResult>` | 全局游戏开关开启时才展示入口；`outcome === 'completed'` 才复活，`skipped/failed` 保持死亡界面；每局只调用一次成功复活 |
| 存档 | `context.services.storage.getGameData('endless-sword') / writeGameData(...) / flush()` | 只在结算与退出时写；见 4.8 |
| 暂停/退出/重开 | `context.requestPause() / requestExit(result) / requestRestart(result) / requestLobby(result)` | 游戏内永远走 Context，不碰场景切换 |
| 右上暂停按钮 | `PlatformSafeLayout.calculateTopRightControlPosition(...)`（assets/shared/ui） | 强制使用，禁止写死坐标 |
| 统计 | 无需直接调用 | `requestExit` 结算自动触发 `trackGameEnd`；extra 字段即埋点载荷 |

`EndlessSwordServices` 泛型收窄为 `{ audio, feedback, platform, storage, ads }`（App.ts 注入集合的子集）。

### 4.8 存档设计

- `GameSaveData.dataVersion = 1`（`ENDLESS_SWORD_DATA_VERSION`），自定义数据全放 `custom`：

```typescript
interface EndlessSwordSaveCustom {
  version: 1;              // 与 dataVersion 同步维护，双保险
  bestScore: number;
  bestSurvivalMs: number;
  maxBossKills: number;
  maxRealm: number;
  tutorialSeen: boolean;
}
```

- 读档时按 `dataVersion` 判断：大于当前版本拒绝读取（沿用 chess-endless 惯例）；小于则走 `vN → vN+1` 逐级迁移函数链，迁移失败恢复安全默认值，不清空根存档。
- 不落盘局内进度：暂停恢复只在局内（内存态），退出即终局。

### 4.9 Debug Bridge 与可测性（策划案 §120）

- `globalThis.__ENDLESS_SWORD_QA__`（DEV + 浏览器环境才安装，dispose 时删除，模式参照 chess-endless）：当前骨架冻结暴露 `start/finish` 与 `snapshot()`；策划案 §120 的完整命令集（`pause/resume/restart/killPlayer/setHp/addXp/levelUp/setTime/spawnEnemy/spawnElite/spawnBoss/killAllEnemies/giveSkill/setSkillLevel/givePassive/evolveSkill/spawnTianjiOrb/triggerDisaster/setSeed`）随对应系统接入后逐步补齐。
- URL 场景注入：`?swordQa=disaster30|bossRush|fullSkills|noRevive|lowHp` 等预置状态，供浏览器自动化回归。
- 数值验收工具化：`setTime` 快进 + `snapshot` 读数，用于核对 §128～§132 曲线目标，不靠人工挂机。

### 4.10 屏幕适配与 HUD

- 场景：Canvas（750×1334 基准，`fitWidth`）显式绑定本场景 UI Camera（`_cameraComponent` 不得为 null）；UI Camera 正交、只渲染本游戏 UI Layer；世界层与 UI 层隔离。
- HUD 按 §76/§77：顶部 HP/时间/境界避让胶囊，XP 条、右侧技能图标列（最多 11，自动缩小）都在安全区内；摇杆全屏游戏区生效。
- 矮屏压缩 HUD 约 18% 不压 Gameplay；超长屏只显示更多世界区域；所有布局读运行时 `view.getVisibleSize()`。

### 4.11 随机与复现

- 全部玩法随机（升级选项、敌人类型、灵珠、掉落、暴击）统一走 `SeededRandom`，单实例单序列。
- 生产 seed = 进入本局的 timestamp；QA 可 `setSeed` 固定。同 seed 必须复现同一局（升级顺序、刷怪、灵珠、掉落一致），这是 §134 Seed Replay 用例的验收口径。

## 5. 里程碑任务分解

### M0 立项与脚手架（2 工日）

| ID | 任务 | 验收 |
| --- | --- | --- |
| T0.1 | 写 `docs/ENDLESS_SWORD_VISUAL_SPEC.md`：主题名、设计关键词、色板（§84）、字体层级、控件造型、图标/动效/声音方向、**禁止方向**（禁复用其他游戏皮肤） | 评审通过并冻结；正式素材生成前完成 |
| T0.2 | 建 `assets/games/endless-sword/` + folder meta + `scenes/EndlessSword.scene`（Canvas 绑相机、Layer 隔离）+ `EndlessSwordGame.ts` 空实现（七生命周期方法 + showPauseMenu/showResultView 占位） | 场景验证断言相机引用可解析为 `cc.Camera` |
| T0.3 | `games.json` 注册（development）+ 大厅占位封面/图标 | `tools/verify-game-bundles.js` 通过；大厅可见（dev）入口卡 |
| T0.4 | 打通最小开发占位 UI：入场 HUD 骨架、暂停/结算先用 shared 回退视图验证链路；`begin()` 由 Runtime 统一驱动 | 大厅进入 → begin → 暂停 → 重开 → 退出 → 二次进入，10 次循环无报错、无节点残留（QA snapshot 池计数归零） |

每个任务完成门槛：`tsc` 无编译错误、`git diff --check` 通过；涉及界面后按 AGENTS 走 Cocos MCP `refresh` + 浏览器预览自查（下同，不再重复）。

T1.4/T1.5 落地说明（2026-08-23）：空间哈希 cell 固定为 128；Enemy/Projectile/XP 分别在 `initialize()` 预热 160/160/80 个逻辑槽位及对应视图节点，运行中池耗尽时丢弃生成请求，不扩容。首批四敌纹理由场景序列化引用并随 Bundle 生命周期释放；死亡帧先完成 HP、击杀分与 XP 结算，再在原敌人池槽播放 0.22 秒通用死亡表现后归还。T1.8 接入正式 `SpawnSystem` 前，开局仅生成四敌验证编队。

### M1 P0 核心可玩（7 工日）——证明"割草好玩"

| ID | 任务 | 验收 |
| --- | --- | --- |
| T1.1 | `GameLoop`（30Hz 固定步）+ `RunModel` + `gameplayElapsedTime` | 暂停/恢复/切后台时间不漂移 |
| T1.2 | `WorldBackground` 3×3 Tile + `CameraRig` 跟随 | 任意方向跑 10 分钟无接缝、节点数恒定 9 |
| T1.3 | `FloatingJoystick`（§6 参数）+ PlayerSystem 移动 | 死区/越过死区后统一移速/松手停表现正确 |
| T1.4 | `SpatialHashGrid` + CollisionSystem + 伤害结算（先结算后动画，§99） | 单测：cell 边界命中正确 |
| T1.5 | 对象池基础版（Enemy/Projectile/XP）+ 妖鼠/鬼火/腐尸/魔弩四敌（含魔弩走位射击） | 敌人 AI/死亡/回收全程无 new Node |
| T1.6 | 飞剑 + 周天剑阵/天雷符/离火诀（P0 四技能）与 SkillConfig 数据驱动框架 | 技能参数全部来自配置 |
| T1.7 | XP 珠（上限 80/合并/四级视觉）+ 升级公式 + 三选一 UpgradeOverlay（4 技能 4 心法、刷新 ×2、灵泉） | 连续升级排队不丢事件 |
| T1.8 | SpawnSystem + DifficultyConfig（速率表/构成表/时间成长） | 5 分钟曲线与 §128 对齐 |
| T1.9 | 精英血煞剑奴 + Boss 青面魔猿（冲锋 + 地震全机制）+ Boss HP 条 + 掉落回血 | 首 Boss 20～45 秒可击杀（数值复核） |
| T1.10 | 自绘 HUD/Pause/Result + Restart（§114）+ Dispose（§115） | §134 生命周期用例通过；QA 池计数归零 |
| T1.11 | **P0 Playtest**（真人 + `setTime` 快进数值复核） | §128 五分钟目标达标；核心循环"还想再来一局" |

### M2 P1 完整玩法（12 工日）

| ID | 任务 | 验收 |
| --- | --- | --- |
| T2.1 | 剩余 7 主动技能（寒霜/镇岳/追魂/葫芦/星陨/风刃/太极灵珠） | 每技能命中/持续/穿透行为与策划案逐条对表 |
| T2.2 | 剩余 4 心法 + 全部升级权重规则（§34 含灵泉并入、全获得移除、§36 保底） | 权重分布单测：1 万次采样误差 <1% |
| T2.3 | 11 个技能进化 + 天道宝箱（§29 全规则：30s/自动飞拾/单进化直进/多 Boss/上限 2） | §134 Boss 用例 + 宝箱边界用例 |
| T2.4 | 剩余 5 普通敌人 + 魂虫/鬼火怪 + 2 精英（全特殊机制：狼妖冲锋/裂魂分裂/阵法增益/魔甲护盾/毒蛊毒区/雷狱环形雷/吞灵吸引） | 每个特殊机制有 QA 触发路径 |
| T2.5 | 其余 4 Boss（鬼母弹幕召唤/雷翼雷区瞬移/魔将扇形剑气/饕餮吸引咬击，含狂化阶段） | Boss 叠加出怪正常；BGM02 切换正确 |
| T2.6 | 天机灵珠系统（六种/45s/10s 存在/不连三次同种/不生成在敌身体里） | `spawnTianjiOrb` + seed 复现单测 |
| T2.7 | 境界系统 + 突破奖励 + 境界/灾厄 HUD 标签 | `bossKills → realm` 映射正确 |
| T2.8 | 灾厄系统（六灾厄 2 分钟一档 + 魔化精英倍率 + 爆魂危险圈 + 终末劫 75:00 起） | `triggerDisaster` 快进 90 分钟全链路数值正确 |
| T2.9 | 玄境系统（进入条件 11+8 全 Lv5、八种玄境项、进化技能玄境卡池） | 快进构造满成型局验证进入时机 |
| T2.10 | 广告复活全流程（§74：清怪/击退/倒计时/无敌窗口/广告三态/每局一次） | §134 Revive 用例 |
| T2.11 | 存档读写 + 迁移骨架 + 新手三段提示（首移即隐/首升级/首次可进化） | 二次进入读档正确；提示只出现一次 |
| T2.12 | Debug Bridge 全命令 + `?swordQa=` 场景 | 命令全部可用且 dispose 后卸载 |

### M3 性能硬化（4 工日，池/网格基础在 M1 已有，此处补全）

| ID | 任务 | 验收 |
| --- | --- | --- |
| T3.1 | 池化补全（DamageNumber/HitVFX/GroundVFX/EnemyProjectile）+ 池上限即预算 | 借还计数平衡，超限丢弃有日志 |
| T3.2 | 分帧策略（屏外敌人隔帧）+ 图集合批整理 | draw call 峰值记录并对比优化前后 |
| T3.3 | 音频/伤害数字/VFX 限流（§98/§103） | 高频场景无声浪堆叠 |
| T3.4 | 压力测试：QA 场景钉死 160 敌/160 投射物/80 XP/80 VFX 跑 10 分钟 + 真机（低端安卓 + iPhone）复测 | 无内存持续增长；目标稳定 30fps 以上 |
| T3.5 | XP 合并、震屏上限、复活清怪等边界复核 | 全部走逻辑层判定 |

### M4 正式美术与音频（8 工日，素材生成从 M2 期间并行启动）

| ID | 任务 | 验收 |
| --- | --- | --- |
| T4.1 | 产出 `ENDLESS_SWORD_ASSET_PROMPTS.md` / `ENDLESS_SWORD_AUDIO_PROMPTS.md`（沿用 image-prompt / audio-prompt 技能惯例） | 与 VISUAL_SPEC 一一对应 |
| T4.2 | 按策划案 §126 四批顺序导入：玩家/四敌 → 四技能 VFX → 背景 Tile/经验珠/HUD → 魔猿/Boss VFX/HP 条 | 每批导入即替换即预览，通过 MCP refresh + 浏览器检查 |
| T4.3 | 第二阶段素材（§127）：其余敌人/精英/Boss/技能/进化/心法/灵珠 Icon/完整 UI/Logo | 逐条完成来源/许可/路径/Bundle 验收 |
| T4.4 | BGM01/02 + 约 30 个 SFX 接入 AudioManager | 无缝循环；Boss 战切换/恢复正确 |
| T4.5 | 演出层：震屏/白闪/Boss 出场阵法/境界突破/灾厄警告/进化全屏提示 | 不阻塞逻辑（先结算后动画） |
| T4.6 | 大厅正式封面 + Logo（lobby Bundle 副本）+ 验收记录 | 大厅卡片显示正确 |

### M5 QA 与验收（5 工日）

- §134 全用例清单化执行（生命周期/Gameplay/Boss/Endless/Revive/Screen/Stress），浏览器自动化 + 真机各一轮。
- 多机型 SafeArea：750×1334、窄屏、短屏、刘海屏、超长屏（模拟器 + 真机）。
- 后台恢复：游戏中切后台/锁屏/广告中切后台，恢复后时间与状态正确。
- Seed Replay：同一 seed 双局对账（升级/刷怪/灵珠/掉落序列一致）。
- 数值曲线复核：§128～§132 各时段目标用 `setTime` 快进 + snapshot 验证，偏差超 ±20% 记录并回调配置。
- 泄漏专项：连续 Restart ×20、连续退出进入 ×10，池计数归零、Bundle 可释放、无微信回调残留。

### M6 发布（1 工日）

`visibility` 切 `public`；`tools/verify-wechat-package-size.js` 校验分包体积；微信开发者工具真机预览全流程（进入 → 死亡 → 复活 → 结算 → 重开 → 退出 → 再进入）；素材验收记录归档；本计划与策划案标记"已实现"。

## 6. 测试与验收口径

1. **每个代码任务的最低门槛**（AGENTS 改动验证）：TypeScript 无编译错误、`git diff --check` 通过。
2. **涉及视觉/交互的任务**：Cocos MCP `assetAdvanced_asset_system` → `refresh`（`db://assets`）→ `project_manage` → `run`（browser）→ 应用内浏览器打开预览地址自查画面、交互、适配。
3. **自动化**：纯逻辑层（UpgradeSystem 权重、XP 公式、难度查表、Seed 复现、SpatialHash）做可运行的单测脚本；端到端用 Debug Bridge + `?swordQa=` 驱动浏览器预览执行 §134 用例。
4. **数值验收**：以策划案 §128～§132 为唯一口径，Debug 快进采点，不凭体感。
5. **性能验收**：以 §104 预算钉死的压力场景为准，真机低端机复测。

## 7. 素材与音频生产计划

- 顺序严格按策划案 §126（P0 四批）→ §127（第二阶段），P0 素材在 M1 末开始生成、M4 统一替换为正式版。
- 每条素材必须：来源/许可可追溯并完成验收记录 → 才能进入候选构建；未确认许可只能当开发占位。
- 大厅封面（1200×900）与游戏 Logo（1536×768）属于"大厅展示副本"，放 lobby Bundle 并注明派生关系。
- 音频两首 BGM（125/138 BPM 无缝循环）+ 约 30 SFX，提示词文档沿用 `*_AUDIO_PROMPTS.md` 惯例。

## 8. 风险与应对

| 风险 | 等级 | 应对 |
| --- | --- | --- |
| 160 实体 draw call 超预算（微信真机） | 高 | M1 起坚持单图集合批；M3 真机提前介入，不等 M5；准备降级开关（VFX 密度/影子层数配置化） |
| 数值失衡（无尽后期一刀秒/打不动） | 高 | 配置全量集中 + `setTime` 快进采点工具从 M1 就有；每次调参只改 config |
| 11 技能 × 5 Boss 范围蔓延延期 | 中 | P0 只做 4 技能 1 Boss 先证好玩；M2 按技能逐个对表验收，不齐不进 M3 |
| 广告真机行为差异（当前 AdService 为 Mock） | 中 | 复活三态流程在 Mock 下先闭环；上线前接真实 provider 单独回归 |
| 泄漏/重复 Session（高频 Restart + 广告暂停恢复组合） | 中 | 池借还计数 + QA snapshot 从 M0 就埋；每里程碑跑生命周期回归 |
| 素材生成质量不达 VISUAL_SPEC | 低 | 提示词文档先评审；不达标重生成，禁止临时借用其他游戏素材顶替 |

## 9. 排期汇总（关键路径）

```text
M0 ──2d── M1 ──7d── M2 ──12d── M3 ──4d── M5 ──5d── M6 ──1d
                      │                    ↑
                      └── M4 ──8d（素材自 M2 中期并行）──┘
```

合计约 **39 工日关键路径**；M4 素材生成与 M2/M3 并行后，日历周期约 30～34 个工作日。每个里程碑出口标准未达标不进入下一个；里程碑内任务顺序可微调，但 T1.11（P0 Playtest）是硬闸门——不好玩先改核心，不加内容。
