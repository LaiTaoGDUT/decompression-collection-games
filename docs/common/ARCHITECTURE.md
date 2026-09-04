# 解压小游戏合集：架构基线

> 状态：已确认，作为项目首版及后续迭代的架构基线  
> Cocos Creator：3.8.8  
> 目标平台：微信小游戏，浏览器预览作为开发环境  
> 设计基准：竖屏 750 × 1334；横向使用 Canvas `Fit Width`，纵向避让顶部胶囊和底部安全区
> 最后更新：2026-09-04

文档索引见：[README.md](../README.md)；各小游戏的实施与验收内容维护在对应的 `docs/games/<gameId>/` 目录中。

## 1. 项目目标

建设一个可以持续增加独立 2D/3D 玩法的微信小游戏合集。主页作为游戏大厅，用户可以浏览、进入、退出和再次游玩内置小游戏。

首期只控制内容数量，不采用临时架构。平台适配、资源分包、游戏生命周期、存档、广告和统计等扩展边界从第一个版本开始建立。

## 2. 架构原则

项目分为四层：

```text
平台层 Platform
    ↓
基础设施层 Core / Services
    ↓
大厅与游戏运行层 Runtime
    ↓
独立小游戏层 Games
```

必须遵循以下边界：

1. 大厅只依赖游戏清单，不依赖具体小游戏实现。
2. 小游戏不得直接调用微信 API，只能使用平台与服务接口。
3. 小游戏不得直接切换场景，只能通过运行上下文请求退出。
4. 小游戏不得自行定义全局广告、统计和存档机制。
5. 每个小游戏使用独立 Asset Bundle，并映射为独立游戏分包。
6. 公共模块不得反向依赖任何具体小游戏。
7. 所有小游戏必须实现统一生命周期协议。
8. 所有全局事件、计时器、资源引用和平台回调都必须可释放。
9. 场景只负责视觉承载，应用流程由状态机和服务控制。
10. 新增第二个及后续小游戏时，不应修改核心加载流程。

## 3. 目录结构

```text
assets/
├── app/
│   ├── App.scene
│   ├── App.ts
│   └── AppConfig.ts
├── core/
│   ├── container/ServiceContainer.ts
│   ├── events/EventBus.ts
│   ├── events/AppEvents.ts
│   ├── lifecycle/AppLifecycle.ts
│   ├── state/AppStateMachine.ts
│   └── types/CommonTypes.ts
├── services/
│   ├── asset/AssetService.ts
│   ├── audio/AudioService.ts
│   ├── storage/StorageService.ts
│   ├── navigation/NavigationService.ts
│   ├── analytics/AnalyticsService.ts
│   ├── ads/AdService.ts
│   └── config/ConfigService.ts
├── platform/
│   ├── Platform.ts
│   ├── WebPlatform.ts
│   └── WeChatPlatform.ts
├── runtime/
│   ├── GameRegistry.ts
│   ├── GameLoader.ts
│   ├── GameSession.ts
│   └── MiniGame.ts
├── lobby/
│   ├── scenes/Lobby.scene
│   ├── prefabs/
│   ├── scripts/
│   └── lobby.bundle.json
├── games/
│   ├── watermelon/
│   ├── sliding-puzzle/
│   ├── switch/
│   └── catch/
├── shared/
│   ├── components/
│   ├── prefabs/
│   ├── shaders/
│   └── ui/
└── resources/configs/
    ├── app.json
    ├── games.json
    └── environments.json
```

启动所需配置放入主包 `resources/configs`，确保即使未被场景直接引用也会进入构建产物，并可通过 `resources` API 使用稳定路径加载。

## 4. 启动与场景模型

`App.scene` 是唯一启动场景，包含常驻根节点：

```text
App.scene
├── PersistentRoot
│   ├── ServiceRoot
│   ├── AudioRoot
│   └── Canvas
│       ├── Camera
│       └── LoadingLayer
└── SceneContainer
```

`PersistentRoot` 必须保持为场景根节点，以满足 Cocos Creator 持久根节点约束；常驻 Canvas 位于其下，用于承载跨场景加载界面。

启动顺序固定为：

```text
初始化平台适配器
→ 初始化服务容器
→ 加载本地配置
→ 尝试获取远程配置并执行降级
→ 注册小游戏
→ 加载大厅 Bundle
→ 进入 Lobby
```

`PersistentRoot` 在场景切换时保持存活；大厅与小游戏场景不得各自重复初始化全局服务。

## 5. 小游戏协议

所有小游戏实现统一接口：

```ts
export interface MiniGameContext {
  gameId: string;
  sessionId: string;
  difficulty?: string;
  services: GameServices;
  reportScore(score: number): void;
  requestPause(): void;
  requestExit(result?: GameResult): void;
  requestRestart(result?: GameResult): void;
  requestLobby(result?: GameResult): void;
}

export interface MiniGame {
  initialize(context: MiniGameContext): Promise<void>;
  begin(): void;
  pause(): void;
  resume(): void;
  restart(nextContext?: MiniGameContext): Promise<void>;
  dispose(): Promise<void>;
  showPauseMenu?(model: MiniGamePauseModel): void;
  hidePauseMenu?(): void;
  showResultView?(model: MiniGameResultModel): void;
  hideResultView?(): void;
}

export interface GameResult {
  score: number;
  duration: number;
  completed: boolean;
  extra?: Record<string, unknown>;
}
```

`dispose()` 完成后必须满足：

- 不残留定时器和全局事件监听。
- 不残留微信平台回调。
- 不持有已销毁节点。
- 不持有应释放的 Asset Bundle 资源引用。
- 3D 游戏不残留物理回调、动画、粒子、RenderTexture、动态 Mesh、材质实例、后处理与 GPU 纹理引用。
- 每次重开或再次进入该游戏时都得到一个全新的 `GameSession`；局内短路径重开可以复用已加载的场景和 Bundle，但必须注入新的 `MiniGameContext.sessionId`。

暂停与结果呈现采用“公共行为模型 + 游戏可选自有视图”。运行层始终拥有暂停、恢复、重开、结算和返回大厅的流程与去重逻辑，并通过 `MiniGamePauseModel` / `MiniGameResultModel` 注入动作；小游戏若实现可选 Presenter 方法，则在自己的 Bundle 内绘制独立视觉，否则继续使用 `assets/shared` 的公共回退视图。失败/续玩页可通过 `requestRestart` 或 `requestLobby` 直接表达最终去向，但不得自行切场景、卸载 Bundle 或绕过结果持久化。

本次协议扩展保持向后兼容：已有小游戏无需实现新的 Presenter 方法，原有 `requestExit` 路径保持不变，存档和 Manifest 结构无需迁移；运行层仅在局内短路径重开时创建新的 `GameSession` 并注入新的上下文。迁移时可逐个游戏接入短路径；若回滚，运行层仍可退回完整退出/重新进入流程，无需清空用户数据。

## 6. 游戏清单与注册中心

大厅展示和游戏加载必须使用同一份 `GameManifest`：

```ts
export interface GameManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  bundle: string;
  scene: string;
  entryComponent: string;
  icon: string;
  cover: string;
  /** undefined 继承 cover；null 表示加载页不展示封面。 */
  loadingCover?: string | null;
  orientation: 'portrait' | 'landscape';
  renderMode: '2d' | '3d';
  minimumDeviceTier: 'low' | 'medium' | 'high';
  minAppVersion: string;
  enabled: boolean;
  preload: string[];
  tags: string[];
}
```

`GameRegistry` 负责 ID 唯一性校验、版本兼容判断、上下线控制、排序及对大厅和加载器提供查询接口。远程配置只能调整允许动态变化的字段，不能绕过本地兼容性校验。

本地 `games.json` 使用版本化目录结构，`games` 中的每一项都必须符合 `GameManifest`：

```ts
interface GameCatalog {
  schemaVersion: number;
  games: GameManifest[];
}
```

## 6.1 桌面大清理主题数据边界

桌面大清理仍是同一个小游戏、同一个 Bundle 和同一个存档命名空间；主题只替换局内物品目录，不复制或改写小游戏生命周期。`configs/gameplay.json` 的 `themeId` 支持 `random` 或固定主题 ID；默认值为 `random`，每次 `startRound()`（包括重开）重新抽取一次，固定 ID 仅用于调试或定向活动。缺失/非法值回退为 `random`，因此旧配置可以继续运行。

当前注册主题目录暂时只包含“软陶微缩工作台”一套；随机选择逻辑仍按注册目录执行，因此单主题阶段每次开局会稳定落到唯一主题。候选的“童年玩具柜”素材只保留在版本资产与溯源记录中，不进入当前 Bundle 的主题预加载和随机结果。

每个主题定义以下运行时数据：物品 ID 有序目录、目标物品 ID、物品标签/颜色/尺寸倍率和标题装饰物品。收纳规则、三件合并、槽位容量、工具、计时、得分和存档字段保持不变。旧 4×5 图集和命中多边形仅作为原版 2D 运行时的造型与点选参考；新增主题时，运行时资源与主题物品目录一一对应。

新增主题不改变已有存档语义：`collectedBadges` 仍表示当前主题目标物品的收集数量，旧存档不迁移、不清空；主题缺失时使用默认主题并安全返回大厅或重试。大厅只看到 `GameManifest`，不得依赖主题脚本或图集。

## 7. 游戏加载与退出

进入流程：

```text
点击游戏卡片
→ 状态机锁定，阻止重复进入
→ 创建 GameSession
→ 显示统一加载界面
→ 加载游戏 Asset Bundle
→ 预加载场景及关键资源
→ 切换场景
→ 定位 MiniGame 入口组件
→ 注入 MiniGameContext
→ initialize
→ begin
```

退出流程：

```text
小游戏请求退出
→ pause
→ 固化游戏结果
→ 保存数据并上报统计
→ dispose
→ 返回大厅
→ 释放场景依赖和游戏 Bundle
→ 完成资源与监听泄漏检查
```

重开优先走局内短路径：

```text
锁定重开操作
→ 必要时 pause 当前入口
→ 固化并上报旧 Session 的重开结果
→ 创建新的 GameSession 和 MiniGameContext
→ 调用当前入口 restart(nextContext)，只重置本局状态
→ 状态回到 playing，记录新的 game_start
```

局内 `restart` 失败时，必须回退到完整退出流程，销毁可能处于半重置状态的入口、释放游戏 Bundle，再重新进入同一 Manifest；不能继续把半重置实例交给玩家。

加载失败、初始化超时或入口组件不存在时，必须进入统一错误状态，允许重试或返回大厅。

## 8. 应用状态机

状态集合：

```ts
type AppState =
  | 'booting'
  | 'lobby'
  | 'loading-game'
  | 'playing'
  | 'paused'
  | 'restarting-game'
  | 'leaving-game'
  | 'error';
```

合法转换：

```text
booting → lobby | error
lobby → loading-game
loading-game → playing | error
playing → paused | restarting-game | leaving-game
paused → playing | restarting-game | leaving-game
restarting-game → playing | leaving-game | error
leaving-game → lobby | error
error → lobby | loading-game
```

场景切换、前后台切换、广告暂停和恢复都必须通过状态机协调，不得由业务脚本直接修改全局状态。

## 9. 平台适配层

业务代码只能依赖 `Platform` 接口：

```ts
export interface AccelerometerSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Platform {
  readonly id: string;
  initialize(): Promise<void>;
  dispose(): void;
  getDeviceProfile(): DeviceProfile;
  getSafeArea(): SafeArea;
  getLayoutInfo(): PlatformLayoutInfo;
  getLaunchOptions(): LaunchOptions;
  supportsVibration(): boolean;
  vibrate(type: 'light' | 'medium' | 'heavy'): void;
  supportsAccelerometer(): boolean;
  startAccelerometer(): void;
  stopAccelerometer(): void;
  onAccelerometerChange(callback: (sample: AccelerometerSample) => void): Unsubscribe;
  showShareMenu(): void;
  onShow(callback: () => void): Unsubscribe;
  onHide(callback: () => void): Unsubscribe;
  pickLocalImage(): Promise<LocalImageSelection | null>;
  cancelLocalImagePicker(): void;
}

export interface LocalImageSelection {
  readonly uri: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
  readonly release: () => void;
}
```

首期必须提供：

- `WebPlatform`：Creator 浏览器预览与自动化验证。
- `WeChatPlatform`：微信小游戏运行环境。

`wx.*` 调用只能存在于 `WeChatPlatform` 或明确的平台服务实现中。

`pickLocalImage()` 是业务层唯一的本地图片入口，`cancelLocalImagePicker()` 用于入口销毁或离开小游戏时终止仍在等待的原生选择请求；没有请求时必须安全无副作用。Web 使用浏览器文件选择；微信只使用仍在维护的 `wx.chooseMedia`（基础库低于 2.23 时直接判失败并回到可重试的选择页），不回退已停止维护的 `wx.chooseImage`——该接口在部分客户端上首次成功后二次调用静默失效。平台只返回本地临时引用和可选元信息，不提供上传能力；图片的解码、裁切、压缩和棋盘采样在客户端完成。调用方必须在重新选择、退出、应用销毁和 Bundle 释放前调用 `release()`，不得把图片路径、文件名、Object URL、图片字节或图片哈希写入统计、广告、远程配置或跨会话存档。

选图会短暂打开平台原生 UI，微信可能在此期间派发一对 `hide/show` 回调。`WeChatPlatform` 必须将这对仅由图片选择器产生的回调与游戏暂停状态隔离，避免运行层在选图时进入 `paused`；该处理放在平台层而不是小游戏中，以保持 `wx.*` 和平台生命周期判断的边界。若未来平台 SDK 改变回调顺序，仍以当前图片选择 generation 和幂等取消为准。替代方案是让每个小游戏自行识别平台回调，但会造成重复实现和退出时无法统一取消；当前方案对现有 Web/微信实现均向后兼容，回滚时可移除取消接口及对应平台隔离逻辑，不影响存档、Session 或 Bundle 边界。

`DeviceProfile` 至少包含性能档位、像素比，以及平台能提供时的内存和性能基准信息。浏览器实现必须允许注入设备档位，以便稳定复现低、中、高画质路径。

## 10. 公共服务

### AssetService

负责 Bundle 加载、预加载、引用追踪、释放和重复加载合并。

### AudioService

负责背景音乐、音效、音量、开关、前后台暂停与音频实例复用。

`BundleAudioBank` 支持 `optionalMusic` 和 `optionalCues` 作为分阶段导入音频的注册入口：可选音频缺失时跳过该 BGM/Cue，不得阻断同一 Bundle 中已存在的音乐、必需音效或游戏加载；资源补齐后按相同路径注册并播放。`logOptionalFailures=false` 只用于产品已明确延后交付全部音频的游戏，不能用来吞掉必需音频错误。新字段全部可选，旧游戏无需迁移；回滚时删除本游戏的可选路径即可，不影响存档或 Session。

### FeedbackService

负责统一播放反馈音效并按用户设置触发平台振动。`play(cue, options?)` 的可选参数只允许控制当前反馈是否振动；默认值保持现有行为，传入 `{ vibrate: false }` 时仍播放音效但不调用平台振动。桌面大清理的物品拾取和三消合成使用该静音触感选项，其他游戏及失败、胜利、按钮等反馈不受影响。

这样可以在不改变公共音效语义的情况下满足不同玩法对触感强度的要求；替代方案是修改 `drop`/`merge` 的全局振动映射，会误伤其他小游戏，或由游戏直接调用平台 API，违反公共服务边界。该参数为可选且不涉及存档迁移，旧调用保持兼容。

### StorageService

负责默认值、版本迁移、异常恢复、游戏数据隔离和底层持久化。小游戏的每次逻辑操作都必须立即提交最新根快照到内存并触发保存；公共服务只对 `localStorage.setItem` 做单一根快照的 3000ms throttle，连续操作不会无限推迟写入。暂停、微信 hide、结算、退出、重开、Bundle 释放前和应用销毁都必须调用同步 `flush()`，绕过节流写入最新快照。序列化在逻辑提交点完成，延迟队列只保存最新 revision；写入失败保留 dirty 快照并由后续写入或 flush 重试。连续物理状态由小游戏按自身容错需求配置额外快照间隔；西瓜游戏当前为约 1s。

小游戏自己的 `custom.gameDataVersion` 迁移若失败，必须先调用
`backupGameDataMigrationFailure(gameId, reason)`。该操作把迁移前的完整根快照写入独立的
`*.migration-backup.<gameId>` 键，再允许小游戏在自己的命名空间使用安全默认值；它不修改当前
内存快照、不删除旧游戏键，也不允许小游戏取得底层 `StorageProvider`。这样既能满足单游戏迁移
失败的可恢复性，又不会把游戏级 schema 逻辑上移到公共服务。替代方案是在小游戏直接访问
`localStorage`，会绕过命名空间与平台边界，因此禁止采用。回滚此能力只需停止游戏侧调用，备份键
可保留，不影响现有根存档读取。

### NavigationService

负责大厅、加载页、小游戏和公共弹窗之间的导航请求，内部受状态机约束。

### AnalyticsService

负责统一事件模型、公共字段补全、开发环境日志与正式上报适配。

### AdService

负责广告实例复用、加载重试、频率控制、完整观看判断、暂停恢复和开发环境模拟。

微信平台广告由明确的平台实现 `WeChatAdProvider` 持有，`wx.createRewardedVideoAd` 及其事件监听不得进入 App、Runtime 或小游戏。广告请求必须携带 `placement`、`gameId`，局内请求还必须携带 `sessionId`；当前注册 `watermelon-revive`、`chess-endless-revive` 与 `desktop-cleanup-rewarded`，避免小游戏误投到其他游戏的广告位。激励视频只有旧基础库无参数 close 回调或 `isEnded === true` 时返回 `completed`，中途关闭返回 `skipped`，加载、展示、超时和销毁均返回 `failed`；只有业务层收到 `completed` 才能发放复活或工具奖励。

全局应用配置通过 `ads.games[GameManifest.id].enabled` 独立控制每个小游戏的广告入口；未列出或显式关闭的游戏隐藏广告入口，点击也不会进入奖励流程。开关开启时，每个符合玩法条件的广告机会都必须展示自己的“看广告”入口；玩家点击后由 `AdService` 在展示边界统一判断配置，若对应 `adUnitId` 为空或广告路由未配置，则直接返回 `completed`，不调用平台、不改变暂停状态，小游戏继续走正常成功奖励路径。只有存在可用广告配置时才进入微信/模拟 Provider，Provider 的完整观看、中途关闭、加载失败和超时结果保持原语义。正式微信环境要求对应 `adUnitId` 非空才会实际请求，Web 和 `development.mockAds` 可在开关开启时使用模拟激励广告完成验收。

产品决定不接启动/开屏广告，因此应用配置、App 启动调度、微信插屏 Provider 和专用状态均不保留。广告配置 schema 从 v2 增至 v3，但不修改 `MiniGame`、根存档或游戏存档 schema；旧应用配置缺少游戏开关或象棋广告位时由默认值补齐，不需要迁移用户数据。若回滚激励广告接入，可移除对应 Provider、placement 路由和 `ads.games` 开关，不需要清理用户存档。

### ConfigService

负责本地配置、远程配置、环境差异、缓存及失败降级。

所有服务通过 `ServiceContainer` 获取，禁止在业务中散落实例化全局单例。

## 11. 存档结构与迁移

存档从第一版开始携带版本号：

```ts
interface UserData {
  schemaVersion: number;
  settings: {
    musicEnabled: boolean;
    soundEnabled: boolean;
    vibrationEnabled: boolean;
  };
  games: Record<string, {
    dataVersion: number;
    highScore?: number;
    playCount: number;
    lastPlayedAt?: number;
    custom?: Record<string, unknown>;
  }>;
}
```

每次结构变化必须提供从上一版本到当前版本的迁移函数。单个小游戏只能读写自己的数据命名空间。

当前根存档版本为 `schemaVersion: 2`。迁移必须按 `vN → vN+1` 顺序逐级执行；首个示例迁移 `v1 → v2` 将早期可缺省的 `settings.vibrationEnabled` 补为 `true`。迁移完成并通过当前结构校验后才能覆盖主存档；迁移失败时先把原始字符串写入独立备份键，再恢复默认数据。

合成大西瓜当前使用游戏内 `dataVersion: 3`，其 `custom` 已知字段为 `maxFruitLevel`、`continueOfferCount`、`continueCompletedCount` 和 `activeRound`。读取旧版本或字段不完整的数据时，在游戏命名空间内补齐非负默认值并保留未知自定义字段；根存档版本不因此升级。`playCount` 只在新一局开始写入，`lastPlayedAt` 会随开始、投放/合成、暂停和约 250ms 的物理快照写入；活动局快照用于异常退出后恢复，最高分、历史最大水果和续玩统计在结算或退出兜底时更新。回滚到不识别 v3 的旧游戏代码时，公共存储仍会保留该命名空间；安全回滚策略是旧代码忽略新增 `custom` 字段，禁止删除或重置用户根存档。

霓虹 2048 使用独立游戏命名空间 `game2048` 和游戏内 `dataVersion: 4`，其 `custom` 已知字段为 `highestTile`、`activeRound`；`highScore` 保存历史最高分。`activeRound` 在原有 `targetAcknowledged`（4096 目标确认）之外增加 `milestoneAcknowledged`（2048 里程碑弹窗确认）。版本迁移沿游戏命名空间执行：历史 v1/v2 的 `activeRound.targetAcknowledged` 语义是“2048 目标层已确认”，迁移为 `milestoneAcknowledged` 并将新的 `targetAcknowledged` 置为 `false`；v3 的 `targetAcknowledged` 已表示 4096 目标确认，缺少 `milestoneAcknowledged` 时补为 `false`，让恢复中的 2048 棋盘可以展示新增里程碑弹窗；v4 之后两个字段分别保持各自语义。迁移保留 `board`、`score`、`highestTile`、`highScore`、未知 `custom` 字段及 activeRound 中未知字段，下一次成功写入时统一落为 v4；不修改根存档 schema。有效移动和暂停路径都会同步写入当前 activeRound。回滚到不识别 v4 的旧游戏代码时，旧代码只能忽略新增字段或整个 `game2048` 命名空间，禁止删除或重置用户记录；恢复新代码后仍按 v1/v2 → v3 → v4 规则读取，根存档不受影响。

滑块拼图不建立持久化活动局，也不保存自定义图片或跨会话的“继续上一局”快照。其结算页“再来一局”到开始页的快捷项只保留在当前运行时内存中，复用图片、裁切和棋盘规格后生成新的合法打乱；回大厅、应用销毁或重新进入游戏后清理该引用，因此不需要新增根存档或游戏命名空间迁移。

棋逢对手使用独立游戏命名空间 `chess-endless`，当前游戏内 `dataVersion: 2`。v1 → v2 为增量迁移：保留原有分数、局数、设置、统计和未知 `custom` 字段；v2 新增可恢复的 `custom.activeRound`，其中保存完整 `ChessEndlessSnapshot` 以及死亡状态所需的致死前 `recoverySnapshot`。老版本没有活动局时按新局处理，损坏或越界的活动局只被忽略，不清空根存档。新局、道具使用、玩家移动、敌方回合结算、奖励选择、复活、暂停和退出兜底都在逻辑状态改变后同步写盘；结算或明确重开时写入 `activeRound.inProgress: false`。恢复时按 `player`、`enemy`、`reward`、`dead` 阶段分别继续，禁止把 `ended` 快照当作活动局恢复。回滚到不识别 v2 的旧游戏代码时，旧代码可能忽略新增活动局字段，但不得删除或重置根存档；正式回滚前应先由新代码清除活动局标记。

象棋的 `chess-endless-revive` 每局最多成功一次，且仅在广告开关开启时展示专属视频复活弹窗；点击后由 `AdService` 判断广告配置，服务缺失或广告位未配置按 `completed` 直接复活，已配置广告则按 Provider 结果处理。展示请求必须携带当前 `gameId` 与 `sessionId`，只有 `completed` 才能恢复致死前快照并释放十字斩，`skipped`/`failed` 均保留死亡状态且绝不免费复活。快速重复点击在游戏层锁定按钮，并由 `AdService` 继续执行会话级请求去重。

## 12. 公共 UI 层级

所有场景遵循统一层级：

```text
Canvas
├── SceneLayer
├── PopupLayer
├── ToastLayer
├── LoadingLayer
└── SystemLayer
```

公共 UI 层统一的是层级、状态语义、行为接口、安全区、输入拦截、等待锁和错误恢复，不统一正式视觉皮肤。

- 冷启动、大厅、设置和游戏加载失败使用大厅独立视觉。
- 每个小游戏独立拥有 HUD、暂停、失败、续玩、结果、图标、动效和音效视觉；合成大西瓜不得复用大厅皮肤。
- `PausePresenter`、`ResultPresenter`、加载与错误接口可以保持公共行为契约，但候选版本的呈现由当前视觉所有者提供主题化或游戏自有实现。
- `assets/shared` 中现有公共视图可作为开发回退和行为验证，不作为所有游戏强制共用的正式美术。
- 大厅和小游戏不得跨 Bundle 引用彼此视觉资源；退出游戏后其主题资源随游戏 Bundle 释放。

迁移策略：第二阶段在实现大厅和合成大西瓜正式 UI 时，保留现有 Presenter 行为接口，优先将皮肤与节点移入各自 Bundle；若需要扩展主题注入，先新增可选接口并保留现有公共视图作为回退，不一次性破坏运行链路。回滚时可重新启用现有公共视图，不回滚 Session、存档、Manifest 或平台服务。

## 13. Bundle 与微信分包

| Bundle | 内容 | 构建位置 |
|---|---|---|
| `core` | 框架与公共服务 | 主包 |
| `lobby` | 大厅场景与资源 | 主包 |
| `shared` | 高频公共 UI 和公共资源 | 主包或公共分包 |
| `game-<id>` | 单个游戏的脚本、场景、配置和 Prefab | 微信本地独立分包 |
| `game-<id>-assets` | 单个游戏的图片、音频、字体、动画等非代码资源 | 微信远程 Asset Bundle |

资源规则：

- 每个游戏固定由一个本地代码 Bundle 和一个同名 `-assets` 远程资源 Bundle 组成；两者是并列 Bundle，禁止嵌套 Asset Bundle。
- `GameManifest` 自 `schemaVersion: 2` 起必须同时声明 `bundle` 与 `resourceBundle`。前者指向本地代码分包，后者指向远程资源包；v1 清单不再被运行时接受，目录配置必须随应用版本原子升级。
- 进入游戏时，`GameRuntime` 先加载 `resourceBundle`，并通过 `AssetService` 对其 `visual` 根目录执行完整 `loadDir`；全部资源成功后再加载代码 Bundle、启动场景、调用 `initialize()` 和 `begin()`。不允许把首局必需资源推迟到游戏过程中下载。
- 远程资源 Bundle 的优先级必须高于代码 Bundle，使场景和 Prefab 中的静态资源依赖由已加载的远程 Bundle 提供；远程包不得包含 TypeScript、JavaScript、场景或游戏逻辑配置。
- 退出、进入失败和重试前必须依次切离游戏场景，并由 `AssetService` 尽最大努力释放代码 Bundle 与资源 Bundle；其中一个释放失败不得跳过另一个。
- 单游戏资源只能放在该游戏的代码 Bundle 或资源 Bundle，资源运行时路径保持以 `visual/` 开头。
- 真正跨游戏复用的资源才允许放入 `shared`。
- 游戏 Bundle 之间禁止互相引用。
- 图集和音频按照使用范围拆分。
- 所有动态加载和释放必须经过 `AssetService`。
- 每次构建检查主包体积、分包体积和重复资源。

### Auto Atlas（`.pac`）约定

Auto Atlas 只用于同一游戏、同一视觉模块内会一起使用的小型 SpriteFrame，例如 HUD、道具图标、棋子和数字方块；全屏背景、平铺纹理、大型面板、照片预置和其他需要独立压缩/独立替换的图片继续作为单图资源。当前已接入的图集如下：

| 游戏 | `.pac` | 用途 |
|---|---|---|
| `chess-endless` | `visual/icons/chess-icons.pac`、`visual/pieces/chess-pieces.pac` | 道具图标、棋子 |
| `doodle-jump` | `visual/ui/hud/doodle-hud.pac`、`visual/ui/item-icons/doodle-item-icons.pac` | HUD、道具图标 |
| `sliding-puzzle` | `visual/icons/sliding-icons.pac` | 操作图标 |
| `twenty48` | `visual/pieces/twenty48-pieces.pac` | 数字方块 |
| `watermelon` | `visual/cats/frames-c6/watermelon-cat-frames.pac` | 猫咪动画帧 |

图集内的 PNG 必须以 SpriteFrame 类型导入。由于运行时按字符串路径动态请求帧，`.pac.meta` 保持 `filterUnused: false` 和 `removeSpriteAtlasInBundle: false`；确认微信构建产物已包含图集后，原始纹理和图片由 Auto Atlas 的 `removeTextureInBundle/removeImageInBundle` 规则移除，避免重复打包。运行时通过 `AutoAtlasLoader` 加载 `.pac`、按帧名取得 SpriteFrame，并复制为游戏自有帧；游戏销毁自有帧，Bundle 的最终释放仍统一交给 `AssetService`，禁止业务直接卸载图集。

编辑器预览阶段图集可能尚未生成，`AutoAtlasLoader` 会回退到同目录原始纹理，因此不影响场景编辑和浏览器预览；微信构建/发布必须以真实生成的 Atlas 产物为准。若要回滚，只需移除对应 `.pac` 并恢复普通纹理加载，源 PNG 和 SpriteFrame 元数据仍可保留，不涉及存档迁移。

构建与发布要求：微信目标开启远程 Bundle 和 MD5 缓存，并配置合法的 HTTPS CDN 根地址；上传微信的代码包只包含主包与本地游戏分包，构建产物的 `remote` 目录独立发布到 CDN。浏览器构建保持资源 Bundle 本地输出，以支持开发预览和自动化验证。

兼容与回滚：本次拆分不修改用户存档结构。回滚应用代码时必须同时回滚 `games.json` 和 CDN 资源版本；若需要临时取消远程发布，可保留双 Bundle 目录与清单协议，仅把资源 Bundle 构建配置切回本地，禁止把资源复制回代码 Bundle 形成双份 UUID 或跨 Bundle 引用。发布失败时保留上一版带 MD5 的 CDN 文件，客户端继续按自身构建版本读取，不能覆盖或清理仍被线上版本引用的文件。

### 布局适配基线（强制）

- Canvas 设计宽度固定为 750，游戏 UI 横向统一使用 Cocos `Fit Width`（`fitWidth`）；布局宽度直接使用绑定 Canvas 的可见宽度，左右以屏幕边界为横向布局边界，不把左右系统安全区从内容宽度中扣除。
- 布局安全边界只作用于纵向：顶部内容从微信胶囊和顶部安全区的下方开始，底部内容止于底部安全区的上方；HUD、玩法区、内容面板和可交互控件都必须落在这两个边界之间。
- `SafeArea.left` / `SafeArea.right` 只作为平台原始信息保留、调试或兼容数据，不得参与通用 UI 的横向居中、宽度计算、右上角控件定位或缩放决策。主题自身的视觉留白仍可按设计坐标保留。
- 背景可按 `cover` 等比铺满并允许裁切；矮屏优先等比缩小核心玩法区以落入上下可用高度，高屏保留自然留白，不通过左右安全区、左右裁切或上下越界腾空间。

### Canvas 与 UI Camera 绑定（强制）

每个小游戏场景中的 `cc.Canvas` 必须通过 `_cameraComponent` 显式绑定负责该画布的 `cc.Camera`，该字段不得为 `null`。场景层级中存在 Camera 节点并不代表 Canvas 已经使用该相机；未绑定时，Cocos 的 UI 坐标、Canvas 适配结果和微信小游戏最终可视区域可能不在同一套投影中，常见表现是设计宽度和安全区计算均正确，但界面仍从左右越界或被裁切。

- UI Camera 使用正交投影，只渲染当前游戏的 UI Layer；Canvas、Camera 和 UI 根节点必须使用一致的 Layer。
- `Canvas._cameraComponent` 的引用必须解析到有效的 `cc.Camera` 组件，禁止仅依赖运行时自动查找或编辑器预览中的隐式行为。
- 屏幕适配应以绑定后的 Canvas 坐标系计算 `view.getVisibleSize()` 和纵向平台约束；横向使用 `fitWidth`，纵向使用顶部胶囊/安全区与底部安全区，不能用物理像素直接设置 UI 节点坐标。
- 新增或复制小游戏场景时，项目校验脚本必须检查 Canvas 的相机引用；微信开发者工具验收至少覆盖一个窄屏和一个高屏设备，并检查 Fit Width 横向铺满结果、顶部胶囊避让和底部安全边界。
- 若出现“数值上未超过 750 设计宽度但真机仍然溢出”的问题，先检查 Canvas 的 `_cameraComponent`、Camera 正交尺寸、可见 Layer 和 Canvas 的 `fitWidth`/适配策略，再调整业务布局参数；不得以左右系统安全区作为默认修复手段。

## 14. 2D/3D 渲染与性能基线

合集正式支持 2D 与 3D 小游戏。3D 游戏仍使用统一 `MiniGame` 生命周期、独立场景和独立 Bundle，不建立第二套运行框架。

3D 游戏场景遵循以下基础结构：

```text
Game3D.scene
├── World
│   ├── MainCamera
│   ├── Lighting
│   ├── Environment
│   └── GameplayObjects
└── GameCanvas
    ├── HUD
    └── PauseEntry
```

渲染层必须隔离：

- 常驻系统 Camera 只渲染系统 UI 层。
- 3D 游戏 MainCamera 只渲染游戏世界层。
- 游戏 UI Camera 只渲染当前游戏 UI 层。
- 系统 UI、游戏 UI、3D 世界的 Layer ID 由应用配置统一提供，业务代码禁止硬编码数值。
- 常驻 LoadingLayer 的 Camera 优先级高于游戏 Camera，且不得错误清除已经渲染的游戏画面。

画质策略必须读取 `DeviceProfile`，至少支持低、中、高三档。每个 3D 游戏在制作前必须声明并验证：模型面数、Draw Call、材质数、贴图尺寸、骨骼数、粒子数、实时灯光、阴影、Shader 变体、Bundle 体积和峰值内存预算。具体阈值以首个 3D 验证游戏的真机基准测试固化，不凭桌面预览结果决定。

低档设备必须具有明确降级路径，包括关闭实时阴影与后处理、降低渲染分辨率和粒子数量、限制同时活动的物理对象，并优先使用烘焙光照或简单光照模型。

进入 3D 游戏时，加载器根据 `renderMode` 和 `minimumDeviceTier` 执行兼容性判断，并将 Shader 预热资源纳入 `preload`。退出后除普通资源检查外，还必须验证 CPU 与 GPU 资源均已释放。

## 15. 统计事件基线

首期固定以下事件语义：

```text
app_launch
lobby_expose
game_card_click
game_load_start
game_load_success
game_load_failed
game_start
game_pause
game_resume
game_finish
game_exit
ad_request
ad_result
```

游戏事件公共字段至少包括：`gameId`、`gameVersion`、`sessionId`、`duration`、`appVersion` 和 `platform`。初期允许只写控制台实现，但业务调用方式不得因后续接入统计平台而改变。

## 16. 异常与降级

首期必须覆盖：

- Bundle 下载或加载失败。
- 场景加载失败。
- 游戏入口组件不存在。
- 游戏初始化超时。
- 远程配置获取失败并回退本地配置。
- 广告加载或播放失败。
- 存档损坏并恢复默认数据。
- 前后台切换导致的暂停与恢复。
- 低内存告警后的非关键资源释放。
- 设备档位不满足 3D 游戏最低要求时的禁用或友好提示。
- 3D Shader 编译、物理初始化或 GPU 资源创建失败后的安全退出。

任何单个小游戏异常都不得导致整个合集失去响应。

## 17. 《纸片跳跃》规划接入记录

《纸片跳跃》当前只完成规划，尚未进入正式 Bundle 实现。规划文件为 `docs/games/doodle-jump/DOODLE_JUMP_GAMEPLAY_SPEC.md`，版本 v2.5；目标 Bundle 为 `game-doodle-jump`，Manifest `gameId` 固定为 `doodle-jump`，场景和入口分别为 `scenes/DoodleJump` 与 `DoodleJumpGame`。大厅只依赖 Manifest 和大厅展示副本，不加载游戏内纸片素材。

危险物与道具继续由独立确定性随机流和各自系统生成，但危险物的全局候选门槛必须取 UFO、黑洞、捕兽夹三者的最早解锁高度，不能再由 UFO 解锁高度代替所有危险物门槛；这样 UFO 可以延后到第三个背景场景而捕兽夹仍能前置出现。道具、怪物和敌方危险物在生成时必须双向读取另外两类对象的占位碰撞盒，任何后生成对象都不得与已有对象重叠。该占位规则只属于 `game-doodle-jump` 本地玩法逻辑，不改变公共协议、存档结构、随机流数量或 Bundle 边界；回滚时可恢复旧生成规则，无需迁移用户数据。

本次规划整改选择复用现有公共协议，不新增全局服务或修改 `Platform.startAccelerometer(): void` 的返回契约。游戏通过 `supportsAccelerometer/startAccelerometer/stopAccelerometer/onAccelerometerChange` 建立传感器会话，以首个有效样本和 1500ms 超时判定成功；触摸输入、可复现生成器、失败/复活状态机和纸片视图均属于游戏 Bundle 内部。若未来要加入 Web `DeviceMotion` 或把传感器启动改成 Promise，必须先扩展 `Platform`、同步 WeChat/Web 实现、补充兼容测试和回滚说明，不能在小游戏里直接调用 `wx.*`。

游戏通过现有 `MiniGameContext.services` 使用 `platform`、`audio`、`feedback`、`storage`、`analytics`、`ads` 和 `deviceTier`。`InputService`、`SaveService`、`AppStateService` 不属于当前容器，`AssetService` 由运行层负责 Bundle 加载和释放，因此本游戏不在 Context 中虚构这些服务。暂停、前后台、广告和退出继续经过 `MiniGameContext` 与应用状态机。复活不使用持久库存，由 `ads.games.doodle-jump.enabled` 作为本游戏唯一复活功能开关：开关开启时，每次可用复活机会均通过独立语义广告位 `doodle-jump-revive` 请求激励视频，达到次数上限后直接结算；开关关闭时所有失败均直接结算。广告只有返回 `completed` 时才视为看完；中途关闭或失败不消耗复活机会。没有配置广告位或路由时沿用 `AdService` 的 `completed` 降级语义，不触碰平台广告 API，直接复活成功。应用配置需要为 `doodle-jump` 提供独立复活开关和可选微信广告位，禁止借用其他游戏 placement。

玩法状态在游戏内部显式包含 `Failing` 和 `Resurrecting`，失败快照在进入 `Failing` 前立即写入活动局并同步 `flush()`，复活成功切回 `Playing` 后也立即写入复活后的安全快照并同步 `flush()`。存档使用现有 `GameSaveData`：公共 `playCount/highScore/lastPlayedAt` 分别承载总局数、最高分和最后游玩时间；`custom.gameDataVersion = 3` 在 v2 的高度、击杀、射击统计、传感器设置、独立 `tutorialCompleted` 引导标记和起步助推兼容库存之上，新增可选 `activeRound`。活动局保存版本、保存时间、局前历史基线、本局射击数、成功复活次数和完整 `DoodleJumpSimulationSnapshot`，包括角色速度与位置、相机、平台、生成游标、随机流游标、敌人、危险物、道具及其持续状态。Playing 期间每 3 秒按“活动局固定历史基线＋本局绝对累计”重建并提交一次检查点，底层写入继续由公共存储的 3 秒 throttle 合并；暂停、微信 hide、退出和销毁时立即 `flush()` 最新活动局，Failing/ResurrectPrompt/Resurrecting 阶段只 flush 已保存快照，禁止用不可恢复状态覆盖活动局。重新进入时若 `activeRound` 结构有效，使用其 seed 构造模拟器并恢复局面、复活次数和射击计数，跳过起步助推选择后继续游戏；活动局损坏时只忽略该字段并开始新局，不清空根存档。明确重开、结束结算和丢弃进度会清除 `activeRound`；重复检查点不得重复累加 `playCount/totalShots/totalKills`。v2 → v3 只新增空的可选活动局，无需伪造旧局面；回滚到 v2 时旧代码应把 `activeRound` 当未知字段原样保留，正式回滚前可由 v3 清除活动局。`tutorialCompleted` 只在完整看完首次引导后写为 true，不以 `playCount` 推断。旧规划别名 `doodleJump` 只允许迁移到 `doodle-jump`，未知 `custom` 字段保留，历史规划中若已出现 `resurrectCount` 只能作为不再读取的未知兼容字段原样保留；迁移失败不得重置根存档。复活点只向上寻找：先检查失败相机当前可见玩法区内的安全平台，没有时保持物理与危险更新暂停，让复活流程驱动相机和生成器向上搜索；越过已预生成范围仍没有候选时，生成无危险附着的 Normal 安全平台作为确定性终止条件。该过程不回退高度、分数或生成游标，也不允许向下放置角色。

`DoodleJumpSimulationSnapshot.platforms[].width` 继续沿用现有活动局快照字段，但其语义包含平台运行时宽度：Normal 平台先保存高度曲线给出的收窄宽度，只有大型怪物实际生成成功后才保存确定性扩宽结果。该字段没有新增结构或版本迁移；恢复时先读取快照宽度，并以存活大型怪物重新校验扩宽状态，保证旧快照可安全读取且不会因怪物击杀造成平台几何跳变。

平台系统新增 `vertical-moving` 与 `spiked` 两个游戏内类型，不改变公共 `MiniGame`、Bundle 或服务边界。上下移动平台使用确定性 ID 派生振幅、周期和相位，其活动局快照为所有平台新增可选 `baseX/baseY`，把生成基准位置与当前渲染/碰撞位置分离；旧快照缺少这两个字段时按平台 ID、类型、已保存时间和当前 `x/y` 反推生成基准，因此无需提升根存档或活动局版本，且顺带修正旧 Moving 平台恢复后围绕瞬时位置二次漂移的问题。倒刺平台从第四段星空背景的 950 米门槛起参与插入平台抽样，顶部沿用单向落地面，只有下方倒刺接触属于致命碰撞；生成器、怪物、危险物和道具读取平台的当前动态位置，避免附着物与上下移动平台脱节。回滚时可移除两个新类型并继续兼容旧快照的可选基准字段；若旧客户端遇到包含新类型的未结束活动局，应按现有“活动局结构无效则忽略并开新局”的安全降级处理，不能清空根存档。

三种飞行道具的 `durationSeconds` 继续表示原有主动推升阶段，配置值、飞行速度与角色上升轨迹不因视觉延长而改变。主动阶段结束后保留装备、HUD 和飞行免疫，切回原本就会生效的普通重力，并在竖直速度到达 0 的弹道顶点产生 `power-end`；因此 Jetpack、Propeller Hat、Rocket 的完整可见时间允许不同，但各自总上升距离与改造前一致。现有 `flightRemainingSeconds` 仍保存“主动阶段剩余时间”，旧活动局恢复时无需新增字段或迁移；恢复到 0 但仍有 `flightPower` 的快照按减速段继续至顶点。回滚可恢复旧的到时立即结束视觉逻辑，不改变存档结构或 Bundle 边界。

视觉方向冻结为“纸片跃层·平面涂鸦”：纯 2D 正交、正面纸片、铅笔轮廓和彩笔平涂；参考图的窄白色纸边和柔和偏移落影作为透明素材自身的预烘焙浮纸效果保留，不实现纸张厚度、透视、法线、景深、硬边投影或 3D 材质。主角正式资源交付一张固定自然站立待机姿势基础 Sprite，以及 Rocket、Jetpack、Propeller Hat 各自独立的完整“主角＋道具”组合 Sprite；Shield 改为独立透明 Shield Overlay，运行时作为玩家视觉根节点的覆盖子节点叠加到基础图或任一飞行道具组合图上。Rocket 与 Jetpack 的静态道具本体都背在主角背部，Propeller Hat 位于头顶；所有主角图和组合图复用同一上半身造型、自然站立基础姿势、脚底基线、锚点、尺寸和碰撞盒，Shield Overlay 复用玩家中心和局部挂载基准，不改变碰撞盒。基础图和组合图都只允许自然站立姿势，不制作跳跃、下落、射击、受击、失败、复活或朝向动作帧；无道具时使用基础图，使用 Rocket、Jetpack 或 Propeller Hat 时切换对应完整组合图，使用 Shield 时保留当前主角图并叠加 Shield Overlay。角色、平台、怪物、危险物、道具和纸片 HUD 的落影优先随透明图片预烘焙，需要独立动画时才拆成同 Bundle 的透明 Shadow Sprite，禁止运行时统一生成 DropShadow 或实时 3D 阴影；Rocket/Jetpack 的火焰、喷气、纸屑和拖尾，Propeller Hat 的气流与旋转线，Shield 的护盾脉冲仍使用独立特效资源，不能烘焙进基础图、组合图或 Shield Overlay。纸飞机、轨迹、失败和复活表现也使用独立特效资源。纸飞机是攻击物的原创视觉替代，点击单发与长按连发共用 120ms 全局射击冷却；弹簧/蹦床的悬浮拾取与下一次落地触发、UFO/黑洞/护盾等精确数值也标记为本项目自定义，不宣称复刻原版隐藏实现。
正式图片优先从 `art_sources/涂鸦跃层` 审核、切分并导入；若实现所需图片在该目录缺失，可按冻结视觉规范直接生成补齐，生成结果必须登记来源、用途、尺寸、锚点和碰撞参考后才能进入 `game-doodle-jump` Bundle。正式音乐和音效由产品后续补充，本轮实现只建立独立 Cue、可选资源注册、暂停/恢复和释放接口；音频文件缺失不得阻断加载、玩法、结算或本轮完成验收，也不得临时复用其他游戏音频。
本轮视觉资产边界调整的原因是 Shield 可与 Rocket、Jetpack 或 Propeller Hat 并行生效；改用独立 Shield Overlay 后无需为每种叠加状态制作额外的“主角＋护盾”组合图。该调整不改变玩法状态、碰撞规则、存档结构、Bundle 边界或回滚方式；替代的 Shield 完整组合图方案不再采用。

实现前置约束包括：world units 与米数固定按 `100:1` 换算；普通平台可达性使用固定步长求解器而不是只比较中心点；生成器使用可复现随机流、候选重试和 Normal 安全兜底；连续点击/长按射击不能被对象池软目标转化为玩法上限；性能必须记录 P50/P95 帧耗时、Draw Call、纹理峰值和重复进出泄漏。若首版延期或回滚，只需隐藏/移除 `doodle-jump` Manifest，保留其独立命名空间和已确认视觉来源，不得清除其他游戏或根存档。
