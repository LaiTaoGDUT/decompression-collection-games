# 解压小游戏合集：架构基线

> 状态：已确认，作为项目首版及后续迭代的架构基线  
> Cocos Creator：3.8.8  
> 目标平台：微信小游戏，浏览器预览作为开发环境  
> 设计基准：竖屏 750 × 1334；横向使用 Canvas `Fit Width`，纵向避让顶部胶囊和底部安全区
> 最后更新：2026-08-19

逐步实施与验收清单见：[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)。

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
│   ├── blocks3d/
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

`pickLocalImage()` 是业务层唯一的本地图片入口，`cancelLocalImagePicker()` 用于入口销毁或离开小游戏时终止仍在等待的原生选择请求；没有请求时必须安全无副作用。Web 使用浏览器文件选择；微信使用相册选择并在平台层兼容不同基础库的图片选择 API。平台只返回本地临时引用和可选元信息，不提供上传能力；图片的解码、裁切、压缩和棋盘采样在客户端完成。调用方必须在重新选择、退出、应用销毁和 Bundle 释放前调用 `release()`，不得把图片路径、文件名、Object URL、图片字节或图片哈希写入统计、广告、远程配置或跨会话存档。

选图会短暂打开平台原生 UI，微信可能在此期间派发一对 `hide/show` 回调。`WeChatPlatform` 必须将这对仅由图片选择器产生的回调与游戏暂停状态隔离，避免运行层在选图时进入 `paused`；该处理放在平台层而不是小游戏中，以保持 `wx.*` 和平台生命周期判断的边界。若未来平台 SDK 改变回调顺序，仍以当前图片选择 generation 和幂等取消为准。替代方案是让每个小游戏自行识别平台回调，但会造成重复实现和退出时无法统一取消；当前方案对现有 Web/微信实现均向后兼容，回滚时可移除取消接口及对应平台隔离逻辑，不影响存档、Session 或 Bundle 边界。

`DeviceProfile` 至少包含性能档位、像素比，以及平台能提供时的内存和性能基准信息。浏览器实现必须允许注入设备档位，以便稳定复现低、中、高画质路径。

## 10. 公共服务

### AssetService

负责 Bundle 加载、预加载、引用追踪、释放和重复加载合并。

### AudioService

负责背景音乐、音效、音量、开关、前后台暂停与音频实例复用。

`BundleAudioBank` 支持 `optionalCues` 作为分阶段导入音频的注册入口：可选音频缺失时跳过该 Cue，不得阻断同一 Bundle 中已存在的音乐和必需音效；资源补齐后按相同 Cue 注册并播放。

### StorageService

负责默认值、版本迁移、异常恢复、游戏数据隔离和底层持久化。小游戏的每次逻辑操作都必须立即提交最新根快照到内存并触发保存；公共服务只对 `localStorage.setItem` 做单一根快照的 3000ms throttle，连续操作不会无限推迟写入。暂停、微信 hide、结算、退出、重开、Bundle 释放前和应用销毁都必须调用同步 `flush()`，绕过节流写入最新快照。序列化在逻辑提交点完成，延迟队列只保存最新 revision；写入失败保留 dirty 快照并由后续写入或 flush 重试。连续物理状态由小游戏按自身容错需求配置额外快照间隔；西瓜游戏当前为约 1s。

### NavigationService

负责大厅、加载页、小游戏和公共弹窗之间的导航请求，内部受状态机约束。

### AnalyticsService

负责统一事件模型、公共字段补全、开发环境日志与正式上报适配。

### AdService

负责广告实例复用、加载重试、频率控制、完整观看判断、暂停恢复和开发环境模拟。

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

棋逢对手·无尽挑战使用独立游戏命名空间 `chess-endless`，当前游戏内 `dataVersion: 2`。v1 → v2 为增量迁移：保留原有分数、局数、设置、统计和未知 `custom` 字段；v2 新增可恢复的 `custom.activeRound`，其中保存完整 `ChessEndlessSnapshot` 以及死亡状态所需的致死前 `recoverySnapshot`。老版本没有活动局时按新局处理，损坏或越界的活动局只被忽略，不清空根存档。新局、道具使用、玩家移动、敌方回合结算、奖励选择、复活、暂停和退出兜底都在逻辑状态改变后同步写盘；结算或明确重开时写入 `activeRound.inProgress: false`。恢复时按 `player`、`enemy`、`reward`、`dead` 阶段分别继续，禁止把 `ended` 快照当作活动局恢复。回滚到不识别 v2 的旧游戏代码时，旧代码可能忽略新增活动局字段，但不得删除或重置根存档；正式回滚前应先由新代码清除活动局标记。

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
| `game-watermelon` | 合成大西瓜游戏全部内容 | 独立游戏分包 |
| `game-2048` | 霓虹 2048 的场景、规则、主题 UI 与音频 | 独立游戏分包 |
| `game-sliding-puzzle` | 滑块拼图的场景、规则、图片处理、主题 UI 与音频 | 独立游戏分包 |
| `game-blocks-3d` | 3D 推倒积木验证游戏全部内容 | 独立游戏分包 |
| `game-switch` | 开关游戏全部内容 | 独立游戏分包 |
| `game-catch` | 接球游戏全部内容 | 独立游戏分包 |

资源规则：

- 单游戏资源只能放在该游戏 Bundle。
- 真正跨游戏复用的资源才允许放入 `shared`。
- 游戏 Bundle 之间禁止互相引用。
- 图集和音频按照使用范围拆分。
- 所有动态加载和释放必须经过 `AssetService`。
- 每次构建检查主包体积、分包体积和重复资源。

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
