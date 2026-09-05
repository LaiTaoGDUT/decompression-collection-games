# 解压小游戏合集：架构基线

> Cocos Creator：3.8.8  
> 目标平台：微信小游戏；浏览器预览仅作为开发和自动化验证环境
> 设计基准：竖屏 750 × 1334；横向使用 Canvas `Fit Width`，纵向避让顶部胶囊和底部安全区
> 最后更新：2026-09-05

本文只维护大厅、运行层、公共服务和小游戏之间的稳定边界。具体玩法规则、数值、存档字段、视觉规范和实现记录应放在对应的 `docs/games/<gameId>/` 文档或代码中，不在这里重复。

## 1. 目标与分层

项目是一个可以持续增加独立 2D/3D 玩法的微信小游戏合集。应用包含一个大厅和多个可独立进入、退出、重开的小游戏。

依赖方向固定为：

```text
Platform
    ↓
Core / Services
    ↓
Runtime / Lobby
    ↓
独立小游戏 Games
```

必须遵守以下边界：

1. 大厅只依赖 `GameManifest`，不导入具体小游戏的类、脚本或游戏内资源。
2. 小游戏只能通过 `MiniGameContext` 和公共服务请求暂停、重开、退出、存档、广告、反馈和统计。
3. 小游戏不得直接调用 `wx.*`、切换场景、卸载 Bundle 或创建全局服务。
4. 公共模块不得反向依赖具体小游戏；游戏 Bundle 之间不得交叉引用。
5. 每个小游戏拥有独立场景、代码 Bundle、资源 Bundle 和微信分包，并实现统一生命周期。
6. 场景负责视觉承载，应用流程由运行层、状态机和服务控制。
7. 所有事件、计时器、平台回调、音频实例和资源引用都必须在退出时释放。
8. 新增小游戏应通过清单注册，不应修改核心加载流程。

## 2. 项目结构

```text
assets/
├── app/                 # 唯一启动场景与应用配置
├── core/                # 容器、事件、生命周期、状态机和公共类型
├── platform/            # Platform、WebPlatform、WeChatPlatform
├── services/            # 资源、音频、存档、导航、统计、广告、配置等服务
├── runtime/             # GameManifest、Registry、Loader、Session、Runtime
├── lobby/               # 大厅场景、脚本和资源
├── games/<gameId>/      # 单个小游戏的场景、脚本、配置和 Prefab
├── shared/              # 真正跨场景、跨小游戏复用的公共资源
└── resources/configs/   # 启动必需的本地配置
```

`App.scene` 是唯一启动场景。启动所需配置放入主包 `resources/configs`，通过稳定路径加载；小游戏的玩法和资源不放入大厅依赖链。

## 3. 启动、场景与应用状态

启动场景保持常驻根节点：

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

启动顺序：

```text
初始化平台
→ 初始化 ServiceContainer
→ 加载本地配置并尝试远程配置
→ 注册并校验小游戏清单
→ 加载大厅 Bundle
→ 进入 Lobby
```

`PersistentRoot` 在场景切换时保持存活；大厅和小游戏不得重复初始化全局服务。

应用状态只能由状态机修改，合法状态为：

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

进入、退出、重开、前后台切换和广告暂停/恢复都必须经过状态机；快速重复操作不得创建重复 `GameSession` 或重复结算。

## 4. 小游戏运行协议

运行层负责创建 Session、加载资源、定位入口、注入上下文和编排生命周期。小游戏只实现自己的局内逻辑：

```ts
export interface MiniGameContext<TServices extends object = object> {
  readonly gameId: string;
  readonly sessionId: string;
  readonly difficulty?: string;
  readonly services: GameServices<TServices>;
  reportScore(score: number): void;
  requestPause(): void;
  requestExit(result?: GameResult): void;
  requestRestart(result?: GameResult): void;
  requestLobby(result?: GameResult): void;
}

export interface MiniGame<TServices extends object = object> {
  initialize(context: MiniGameContext<TServices>): Promise<void>;
  begin(): void;
  pause(): void;
  resume(): void;
  restart(context?: MiniGameContext<TServices>): Promise<void>;
  discardSavedProgress?(): void;
  dispose(): Promise<void>;
  showPauseMenu?(model: MiniGamePauseModel): void;
  hidePauseMenu?(): void;
  showResultView?(model: MiniGameResultModel): void;
  hideResultView?(): void;
}

export interface GameResult {
  readonly score: number;
  readonly duration: number;
  readonly completed: boolean;
  readonly extra?: Readonly<Record<string, unknown>>;
}
```

标准进入流程：

```text
锁定入口
→ 创建 GameSession
→ 显示加载层
→ 加载 resourceBundle
→ 加载代码 Bundle 和场景
→ 定位 MiniGame 入口
→ 注入 MiniGameContext
→ initialize
→ begin
```

标准退出流程：

```text
pause
→ 固化结果并保存/上报
→ dispose
→ 切离小游戏场景
→ 释放代码 Bundle 与资源 Bundle
→ 返回大厅
```

局内重开可以复用已加载的场景和 Bundle，但必须使用新的 `GameSession`/`sessionId` 并只重置本局状态。重开失败时回退到完整退出并重新进入，不能继续使用半重置实例。

`dispose()` 完成后不得残留：

- 定时器、全局事件监听、平台回调和异步请求。
- 已销毁节点、音频实例或运行层对象引用。
- 应释放的 Bundle、纹理和其他动态资源引用。
- 3D 物理回调、粒子、RenderTexture、动态 Mesh、材质实例、后处理和 GPU 资源。

暂停、结果和错误视图可以由运行层提供公共行为，也可以由小游戏在自己的 Bundle 中提供主题化呈现；流程控制权始终属于运行层。

## 5. 游戏清单与注册

大厅展示和运行层加载使用同一份清单。清单只描述游戏的元数据和资源入口，不包含游戏运行状态：

```ts
export interface GameManifest {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly bundle: string;
  readonly resourceBundle: string;
  readonly scene: string;
  readonly entryComponent: string;
  readonly icon: string;
  readonly cover: string;
  readonly loadingCover?: string | null;
  readonly orientation: 'portrait' | 'landscape';
  readonly renderMode: '2d' | '3d';
  readonly minimumDeviceTier: 'low' | 'medium' | 'high';
  readonly minAppVersion: string;
  readonly enabled: boolean;
  readonly visibility: 'public' | 'development';
  readonly preload: readonly string[];
  readonly tags: readonly string[];
}

export interface GameCatalog {
  readonly schemaVersion: number;
  readonly games: readonly GameManifest[];
}
```

`GameRegistry` 负责 ID 唯一性、清单结构、版本兼容、上下线、排序和查询。远程配置只能修改允许动态变化的字段，不能绕过本地校验或改变 Bundle 边界。

## 6. 平台与公共服务

业务代码只依赖抽象 `Platform`。平台层统一提供初始化、设备档位、安全区与布局信息、启动参数、生命周期、分享、振动、传感器和本地图片选择等能力；浏览器由 `WebPlatform` 实现，微信由 `WeChatPlatform` 实现。

`wx.*` 只能出现在 `WeChatPlatform` 或明确的平台服务实现中。小游戏不得自行识别平台回调来实现应用暂停，也不得直接访问浏览器或微信存储。

公共服务职责如下：

| 服务 | 职责 |
|---|---|
| `AssetService` | Bundle 加载、预加载、引用追踪、重复加载合并和释放 |
| `AudioService` | 音乐、音效、音量设置、前后台处理和实例回收 |
| `FeedbackService` | 统一反馈音效与可选振动 |
| `StorageService` | 版本化存档、命名空间、迁移、校验、备份和落盘 |
| `NavigationService` | 大厅、加载页、小游戏和公共弹窗的导航请求 |
| `AnalyticsService` | 公共事件字段、开发日志和正式上报适配 |
| `AdService` | 广告路由、实例复用、暂停恢复、结果归一化和失败降级 |
| `ConfigService` | 本地/远程配置、缓存、环境差异和降级 |

所有服务通过 `ServiceContainer` 获取。业务代码不得散落全局单例或直接持有底层 Provider。

## 7. 存档边界

根存档使用版本化快照，游戏只能读写自己的 `gameId` 命名空间：

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
    playCount: number;
    highScore?: number;
    lastPlayedAt?: number;
    custom?: Record<string, unknown>;
  }>;
}
```

存档规则：

- 根结构和游戏自有结构分别维护版本与迁移函数，按版本逐级迁移。
- 读取后必须校验；损坏或迁移失败时保留可恢复备份并使用安全默认值。
- 游戏不得直接访问 `localStorage`、`StorageProvider` 或其他游戏的命名空间。
- 逻辑提交先更新内存快照；暂停、切后台、结算、退出、重开和销毁前必须 `flush()`。
- 新增字段应保持向后兼容，不因单个游戏的 schema 变化升级根存档。

## 8. UI、屏幕适配与相机

公共 UI 统一层级、状态语义、行为接口、安全区、输入拦截、等待锁和错误恢复，不统一大厅与小游戏的正式视觉皮肤。

```text
Canvas
├── SceneLayer
├── PopupLayer
├── ToastLayer
├── LoadingLayer
└── SystemLayer
```

大厅和每个小游戏分别拥有自己的 HUD、弹窗、图标、动效和音效视觉；不同 Bundle 不得互相引用视觉资源。`assets/shared` 只放真正跨场景、跨游戏复用的资源。

布局基线：

- Canvas 设计宽度固定为 750，UI 横向使用 Cocos `Fit Width`（`fitWidth`）。
- 横向布局使用屏幕左右边界，不把左右系统安全区从通用内容宽度中扣除。
- 顶部内容避让微信胶囊和顶部安全区，底部内容止于底部安全区上方。
- 背景可以 `cover` 等比铺满并裁切；矮屏优先等比缩小核心玩法区，高屏保留自然留白。
- 可见和可交互元素必须位于纵向安全边界内，不通过越界或裁切腾空间。

每个小游戏场景的 `cc.Canvas` 必须显式绑定负责该画布的正交 `cc.Camera`，Canvas、Camera 和 UI 根节点使用一致的 UI Layer。布局计算使用绑定 Canvas 的可见尺寸，不直接用物理像素设置 UI 坐标。新增或复制场景时应校验相机引用，并覆盖窄屏、高屏和微信安全区验收。

## 9. Bundle、分包与资源

| Bundle | 内容 | 微信构建位置 |
|---|---|---|
| `core` | 框架与公共服务 | 主包 |
| `lobby` | 大厅场景与资源 | 主包 |
| `shared` | 公共资源 | 主包或公共分包 |
| `game-<id>` | 单个游戏的代码、场景、配置和 Prefab | 本地独立分包 |
| `game-<id>-assets` | 单个游戏的图片、音频、字体和动画等资源 | 远程 Asset Bundle |

资源约束：

- 每个游戏的代码 Bundle 和资源 Bundle 并列存在，禁止嵌套 Bundle。
- 进入游戏时先准备 `resourceBundle`，再加载代码 Bundle、场景和入口；首局必需资源不得推迟到玩法过程中下载。
- 远程资源 Bundle 不包含脚本、场景或游戏逻辑配置；游戏资源路径保持在自己的命名空间内。
- 游戏 Bundle 之间禁止引用；只有真正跨游戏复用的资源才能放入 `shared`。
- 所有动态加载、预加载和释放都经过 `AssetService`；退出、失败和重试时必须释放两个游戏 Bundle。
- 微信构建使用远程 Bundle、HTTPS CDN 和 MD5 缓存；浏览器构建保留本地资源输出。
- 每次构建检查主包、分包体积和重复资源。

### Auto Atlas（`.pac`）

Auto Atlas 只用于同一游戏、同一视觉模块内会一起使用的小型 `SpriteFrame` 集合，例如 HUD、道具图标、棋子或连续动画帧。全屏背景、大型面板、照片和需要独立压缩/替换的资源继续使用单图。图集的加载、引用复制和释放仍由 `AssetService` 统一管理，不得跨游戏或跨大厅合图。

## 10. 2D/3D 与性能

2D、3D 游戏共用同一套 `MiniGame` 生命周期、运行层和资源边界，不建立第二套加载框架。3D 场景可采用以下基本结构：

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

系统 UI、游戏 UI 和 3D 世界使用隔离的 Layer；Layer ID 由应用配置提供，业务代码不硬编码数值。画质策略读取 `DeviceProfile`，至少提供低、中、高档及明确的低档降级路径。每个 3D 游戏在接入前声明并验证模型、Draw Call、材质、贴图、粒子、Shader、Bundle 体积和峰值内存预算；退出时同时检查 CPU 与 GPU 资源释放。

## 11. 统计与异常降级

公共生命周期和广告事件至少携带 `gameId`、`gameVersion`、`sessionId`、`duration`、`appVersion` 和 `platform`。游戏专属指标只在对应游戏的实现和文档中定义。

运行层必须能处理并恢复以下情况：

- Bundle、资源目录、场景或入口组件加载失败。
- 游戏初始化、开始、暂停、恢复、重开或销毁超时/异常。
- 远程配置、广告或存档读写失败。
- 前后台切换、低内存、设备档位不满足要求。
- 3D Shader、物理或 GPU 资源创建失败。

失败时进入统一错误状态，提供重试或返回大厅；单个小游戏异常不得让整个合集失去响应。任何修复都必须同步验证 TypeScript 编译、资源释放和 `git diff --check`。

## 12. 文档维护边界

- 本文只在公共接口、状态机、Bundle 规则、平台边界或跨游戏约束变化时更新。
- 玩法状态、数值、关卡/生成规则、单个游戏的存档迁移、广告位、素材清单和视觉方案，维护在对应游戏文档或代码中。
- 已完成的游戏实现不在本文保留逐项复述；需要了解实现时以代码和游戏专项文档为准。
