# 解压小游戏合集：代码 Review 记录

> 本文件记录每个实施步骤完成后的审查结论。  
> 审查基准见：[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)。

## 2026-08-02：第 1～14 步基线 Review

审查范围：当前全部 TypeScript、App 场景结构、平台生命周期和已完成步骤边界。

结论：

- 核心类型、事件总线、服务容器、状态机、平台适配和 App 组合根职责清晰，没有发现阻塞性循环依赖或提前实现后续业务。
- 发现 Web/微信平台内部监听缺少统一释放入口，App 销毁重建时可能残留监听。已为 `Platform` 增加最小 `dispose()` 契约，并由 App 销毁流程调用。
- 保留第 15 步待办：平台初始化失败目前只记录日志，尚未进入统一 `error` 状态。

验证：严格 TypeScript 编译、核心运行测试、Cocos 脚本导入、场景挂载和编辑器错误检查。

## 2026-08-02：第 15 步 Review

审查范围：平台生命周期初始化失败、错误状态转换、最小失败提示和销毁清理。

结论：

- 失败处理集中在 `App` 组合根，没有新增错误服务或提前实现完整错误页。
- 首次失败的阶段、消息和原始原因会被保留；重复失败不会覆盖根因。
- 失败从 `booting` 进入 `error`，并显示默认隐藏的最小文字提示，避免无反馈空白画面。
- 平台即使初始化失败，App 销毁时仍会执行 `dispose()`。
- 未发现阻塞后续迭代的问题。完整重试和错误页仍按计划在第 36 步实现。

验证：严格 TypeScript 编译、失败路径运行测试、提示节点属性检查、场景保存状态和 Cocos 编辑器错误检查。

## 2026-08-03：第 16 步 Review

审查范围：本地应用配置内容、资源位置和 Cocos 资源元数据。

结论：

- 配置只包含当前已确认的版本、语言、设计分辨率、渲染层、三档画质、超时和开发开关，没有加入远程配置或读取逻辑。
- 配置位于内置 `resources` Bundle，后续可以通过稳定路径加载，不依赖场景引用。
- `app.json` 本身作为完整默认配置；开发开关默认关闭，避免生产构建意外启用调试日志或模拟广告。
- 删除了旧的空 `assets/configs` 目录，避免形成两套配置路径。
- 未发现阻塞后续迭代的问题。

验证：JSON 结构与取值约束、低中高档预算递增关系、生产安全默认值、Cocos 3.8.8 元数据格式和项目内 UUID 唯一性。

编辑器补充验证：Cocos Creator 3.8.8 资源数据库状态正常；刷新 `db://assets/resources/configs` 后，`app.json` 被识别为 `cc.JsonAsset`，UUID 与磁盘 `.meta` 一致；当前场景无未保存修改，编辑器控制台及项目日志均无错误，也未发现该配置的导入失败记录。

## 2026-08-03：第 17 步 Review

审查范围：应用配置类型、本地 `resources` 读取、默认值回退、服务注册和启动顺序。

结论：

- `ConfigService` 只负责从 `configs/app` 读取 `JsonAsset`，没有提前加入远程配置、缓存或重试。
- 配置以代码内默认结构为模板归一化：缺失、类型错误或非正数值会回退默认值，额外字段不会向业务层泄漏。
- 对外只返回完整的 `AppConfig`；原始 JSON 不会被保存或暴露，返回对象及其嵌套对象均被冻结。
- 服务由 `App` 组合根创建和注册，并在平台初始化后、生命周期监听注册前完成本地读取。
- Review 发现并修复了 App 在平台初始化期间被销毁后仍访问配置服务的竞态；同时将逐字段解析精简为默认结构驱动的归一化，降低后续新增配置字段的修改成本。
- 未发现阻塞后续迭代的问题。

验证：全部 `assets` TypeScript 严格类型检查；完整读取、缺字段、非法数值、额外字段、全量回退和深层只读运行测试；Cocos Creator 3.8.8 脚本导入；`App` 组件注册；编辑器控制台及项目日志错误检查。

## 2026-08-03：第 18 步 Review

审查范围：本地游戏目录结构、唯一占位游戏条目、`GameManifest` 字段完整性和 Cocos 资源导入。

结论：

- `games.json` 使用仅包含 `schemaVersion` 与 `games` 的最小版本化目录结构，目前只登记一个占位游戏。
- 占位游戏具备完整的 ID、语义版本、展示文案、Bundle、场景、入口组件、图像路径、方向、渲染模式、设备门槛、应用版本门槛、开关、预加载项和标签。
- 使用独立的 `game-placeholder` Bundle，不引用正式泡泡游戏或其他游戏，后续可以整体移除。
- 本步没有提前实现 Manifest 校验器、注册中心、Bundle 或占位资源；路径是否存在将在对应资源创建步骤验证。
- 架构文档已补充 `GameCatalog` 顶层结构和临时 Bundle 定位，避免后续读取逻辑自行猜测格式。
- 未发现阻塞后续迭代的问题。

验证：JSON 解析；目录版本和单条数量；`GameManifest` 字段集合、基础类型、枚举、语义版本、ID/Bundle 命名和资源路径格式；项目 `.meta` 解析和 UUID 唯一性；Cocos Creator 3.8.8 将 `games.json` 识别为 `cc.JsonAsset`，配置目录和资源查询正常，场景无未保存修改，未发现 `games.json` 导入错误。资源面板在刷新整个目录时记录过一次“原资源不存在”的 UI 通知，但后续目录、UUID 与资源详情查询均正常，判定与本资源导入无关。

## 2026-08-03：第 19 步 Review

审查范围：版本化游戏目录、单条 `GameManifest`、重复 ID、版本、枚举、资源路径、错误隔离和只读输出。

结论：

- 校验器是无 Cocos 依赖的纯 TypeScript 函数，只接受 `unknown`，不负责文件读取、服务注册或游戏加载。
- 错误统一包含完整字段路径和原因；非对象条目、字段缺失及错误类型都会被记录，且不阻断后续条目校验。
- ID、Bundle、入口组件、语义版本、方向、2D/3D 模式、最低设备档位及 Bundle 相对资源路径均有明确格式约束。
- 重复 ID 会报告在后出现条目的字段路径，且重复条目不会进入可用清单。
- 仅支持目录结构版本 `1`；Review 中收紧为不支持的目录版本不返回任何可用清单，避免未来结构被旧代码误读。
- Review 中补全了严格语义版本规则，数字型预发布标识不允许前导零。
- 校验成功后重新构造并冻结 `GameManifest`、数组、错误和结果，不向后续层暴露原始 JSON。
- 未提前实现 `GameRegistry`、配置读取或资源存在性检查，职责边界清晰。
- 未发现阻塞后续迭代的问题。

验证：全部 `assets` TypeScript 严格类型检查；真实 `games.json` 正常路径；全部必填字段逐项缺失；错误类型、非法 ID/Bundle/组件名、版本、枚举和资源路径；重复 ID；混合好坏条目隔离；支持与不支持的目录版本；预发布和构建版本；深层只读；Cocos Creator 3.8.8 脚本导入、相关错误日志、`App` 组件注册及场景保存状态；项目 `.meta` 解析和 UUID 唯一性。

## 2026-08-03：第 20 步 Review

审查范围：清单批量载入、单条注册、ID 查询、可玩列表、设备与应用版本兼容性以及失败原子性。

结论：

- `GameRegistry` 是无 Cocos 依赖的纯内存对象，只保存已经通过校验的 `GameManifest`，不读取 JSON 或 Bundle。
- `load()` 使用临时 Map 构建新状态；输入包含重复 ID 时抛出明确错误且保留原有数据，成功后才原子替换。
- `register()` 拒绝静默覆盖重复 ID；`getById()` 可以查询任意已登记游戏，禁用状态不会影响管理查询。
- `getPlayableGames()` 同时过滤禁用游戏、设备档位不足和当前应用版本不足的游戏，并返回不可修改的新数组。
- Review 对照架构文档后补齐了 `minAppVersion` 兼容判断，避免大厅展示当前版本无法运行的游戏。
- 语义版本解析和比较提取到核心公共工具，与 Manifest 校验器复用；支持预发布优先级、忽略构建元数据，并使用数字字符串比较避免超大版本号精度丢失。
- 没有提前实现资源读取、服务容器接线或大厅逻辑，职责边界清晰。
- Review 发现原计划在 Registry 与大厅之间缺少本地目录启动接线，已新增原子步骤 20.1，避免第 23 步获得空列表。
- 未发现阻塞后续迭代的问题。

验证：全部 `assets` TypeScript 严格类型检查；真实已校验清单载入；批量替换与清空；重复批量载入原子失败；重复单条注册；存在和缺失 ID；低中高设备档位；禁用、最低应用版本和非法当前版本；稳定版、预发布、构建元数据与超大数字版本比较；返回列表只读；Cocos Creator 3.8.8 脚本导入、相关错误日志和场景保存状态；项目 `.meta` 解析和 UUID 唯一性。

## 2026-08-03：第 20.1 步 Review

审查范围：`games.json` 资源读取、Manifest 校验、Registry 容器注册、启动编排、错误阶段和销毁竞态。

结论：

- `ConfigService` 复用统一的 `JsonAsset` 读取方法加载 `configs/games`，只返回校验后的只读 `GameManifest` 数组，不保存或暴露原始 JSON。
- 目录校验失败会抛出 `GameCatalogValidationError`，保留全部字段级错误；资源读取失败保留 Cocos 原始错误。
- `GameRegistry` 在 App 组合根中创建并注册，启动流程在本地应用配置完成后载入游戏目录，成功后 Registry 正好包含占位游戏。
- 平台初始化与游戏目录加载分别使用 `platform-lifecycle` 和 `game-catalog` 错误阶段，组合根自身的意外异常归入 `startup`，不会再把所有启动错误误报为平台失败。
- 目录读取、校验或 Registry 载入失败都会从 `booting` 进入 `error` 并复用现有启动失败提示。
- 每个异步边界后都会确认 App 仍是活动实例；Review 验证了目录加载期间销毁 App 不会记录伪失败或残留平台监听。
- Registry 仍不依赖 Cocos 资源 API，配置读取、校验、存储和启动编排的依赖方向清晰。
- 未加入远程配置、重试、大厅或 Bundle 加载，步骤边界明确。
- 未发现阻塞后续迭代的问题。

验证：全部 `assets` TypeScript 严格类型检查；真实 app/games 配置正常读取并载入一个占位游戏；配置层目录读取失败和字段校验失败；结构化校验错误；App 正常启动接线；`game-catalog` 失败阶段、错误状态与提示；目录加载期间销毁竞态；Cocos Creator 3.8.8 脚本导入、`App` 组件注册、相关错误日志和场景保存状态。

## 2026-08-03：第 21 步 Review

审查范围：`lobby` Asset Bundle 元数据、主包策略、命名唯一性、目录内容和游戏资源边界。

结论：

- `assets/lobby` 已配置为名称固定的 `lobby` Asset Bundle，使用默认优先级 `1`。
- Bundle 明确保留在主包，未启用微信分包或远程 Bundle；这不影响后续通过 `assetManager.loadBundle('lobby')` 独立加载。
- 项目当前仅有 `resources` 与 `lobby` 两个 Bundle，名称唯一，目录 UUID 未变化且项目内 UUID 无重复。
- `lobby` 内仍只有 `scenes`、`prefabs`、`scripts` 预留目录及元数据，没有小游戏资源，也没有提前创建场景、脚本或卡片。
- Cocos Creator 3.8.8 资源数据库已接受目录元数据，目录查询正常，没有 Lobby Bundle 相关错误或未保存场景修改。
- 当前 Bundle 没有实际资源且项目没有既有构建配置，因此未为验证空壳提前生成构建产物；真实按名称加载验证已明确并入第 22 步，在 Bundle 内存在 `Lobby.scene` 后执行。
- 未发现阻塞后续迭代的问题。

验证：Bundle 名称、优先级、主包/分包/远程设置；Bundle 名称唯一性；目录内容白名单和小游戏资源隔离；全部 `.meta` JSON 解析与 UUID 唯一性；Cocos Creator 3.8.8 目录信息、资源详情、相关错误日志和场景保存状态。

## 2026-08-03：第 22 步 Review

审查范围：空大厅场景层级、设计分辨率与安全区、Lobby/App 相机隔离、Bundle 构建产物和资源边界。

结论：

- `Lobby.scene` 已建立 `Canvas/Camera/SceneLayer/PopupLayer/ToastLayer/LoadingLayer/SystemLayer` 公共层级；`SceneLayer` 内只有 `Background/SafeArea/ContentRoot`，没有游戏卡片或具体小游戏引用。
- 公共 UI 节点统一使用真实的 Cocos `UI_3D` 层（`8388608`），Lobby 相机只渲染该层；App 常驻 UI 继续使用 `UI_2D` 层（`33554432`），两个 UI 域不会串层。
- Lobby 相机为正交相机，设计高度对应 `orthoHeight = 667`，使用纯色清屏提供空大厅背景；Review 移除了无必要的默认 Sprite 资源引用，避免为纯色背景增加额外依赖。
- App 系统相机优先级调整为 `100` 且只清深度，解决它在 Lobby 相机之后渲染时可能擦除大厅画面的隐患；Lobby 相机保持优先级 `0` 并负责颜色清屏。
- 项目设计分辨率已在文件和 Creator 当前设置中统一为 `750 × 1334`、适配宽度且不适配高度；大厅 Canvas 使用同一尺寸。
- 安全区直接使用 Creator 内置 `cc.SafeArea`，其 Widget 四边对齐并保留 `ContentRoot` 作为后续大厅内容挂载点，没有引入自定义安全区脚本。
- 层级渲染顺序固定为 `Camera → SceneLayer → PopupLayer → ToastLayer → LoadingLayer → SystemLayer`，后续公共提示不会被场景内容覆盖。
- 一次性 Web Desktop 构建成功；产物包含名称为 `lobby` 的独立 Bundle，场景映射为 `db://assets/lobby/scenes/Lobby.scene`，Bundle 的项目依赖列表为空。验证产物已移出源码目录，不污染仓库。
- Creator 重新载入场景后层级、组件和关键相机参数保持一致，资源刷新后控制台无错误。
- 未发现阻塞第 23 步的结构或依赖问题。

验证：Creator 场景保存并重载；层级和组件复查；`750 × 1334` 项目设置回读；安全区 Widget 参数；Lobby/App 相机优先级、清屏和可见层隔离；一次性 Web Desktop 构建及 `lobby/config.json` 名称、场景映射和依赖检查；全部 `assets` TypeScript 严格类型检查；全部 `.meta` JSON 解析与 UUID 唯一性；场景契约检查；Creator 控制台错误检查。

## 2026-08-03：第 23 步 Review

审查范围：大厅入口组件、组合根访问方式、游戏列表查询参数、具体小游戏依赖和场景挂载。

结论：

- 新增 `LobbyEntry` 组件并挂载到 `SafeArea/ContentRoot`，入口组件只保存 `GameRegistry.getPlayableGames()` 返回的只读结果，不创建卡片或处理点击。
- 游戏清单只从 `GameRegistry` 查询；设备档位来自 `Platform.getDeviceProfile()`，应用版本来自已加载的 `ConfigService.config`，没有直接读取 `games.json` 或复制过滤规则。
- 入口组件只依赖服务 Token、`GameManifest` 类型和 Cocos 基础组件，没有导入 `blocks3d`、`bubble`、`catch`、`switch` 或占位游戏实现。
- App 组合根增加只读的 `App.current` 可选访问入口，没有创建新的容器或全局服务副本；直接预览 `Lobby.scene` 且 App 不存在时保持空列表并输出明确警告，不抛未初始化异常。
- 正常本地配置、Web 中档设备和应用版本 `0.1.0` 下，Registry 返回且仅返回 `placeholder`，数量为 `1`，结果数组不可修改。
- 大厅入口不负责等待启动、场景导航或状态转换；正式导航链路必须继续遵守“平台和配置初始化完成后再进入 Lobby”的启动顺序。
- Cocos Creator 已识别 `LobbyEntry` 脚本并保存组件引用，刷新资源后控制台无错误。
- 未发现阻塞第 24 步的职责泄漏或具体游戏耦合。

验证：全部 `assets` TypeScript 严格类型检查；真实本地清单在中档设备与当前应用版本下返回 1 个只读占位游戏；具体小游戏依赖扫描；入口服务依赖检查；`LobbyEntry` 场景组件挂载检查；Cocos Creator 脚本导入、组件识别、场景保存和控制台错误检查。

## 2026-08-03：第 24 步 Review

审查范围：游戏卡片 Prefab 的节点结构、视觉布局、点击边界、资源依赖、行为边界和大厅场景污染。

结论：

- 新增 `lobby/prefabs/cards/GameCard.prefab`，根节点尺寸为 `680 × 220`，包含且仅包含 `Icon`、`NameLabel`、`DescriptionLabel`、`StatusLabel` 四个展示节点。
- 根节点使用 `Sprite + Button` 提供完整卡片点击区域和按压颜色反馈；Button 的点击事件数组为空，没有提前绑定大厅、导航或游戏加载逻辑。
- 图标、名称、简介和状态都位于卡片边界内，节点之间没有相交；名称与状态保留独立横向空间，长文本使用裁剪策略，不会推动卡片尺寸变化。
- Prefab 全部节点固定为 `UI_3D` 层，与 Lobby 相机可见层一致；独立实例化后保留 5 个节点及预期组件。
- 当前仅使用 Creator 内置默认 Sprite 作为卡片和占位图标，不依赖任何具体小游戏、项目图片、运行服务或自定义脚本。
- Review 发现首次转换 Prefab 时 Creator 接口丢失子节点位置、尺寸和颜色，已在 Prefab 编辑模式中逐项修正并重新保存；修正后的磁盘内容与编辑器属性一致。
- 首次失败请求产生的扁平路径重复 Prefab 已清理，最终只保留 `cards/GameCard.prefab`；资源数据库重新导入成功，控制台无新错误。
- 测试实例已从 `Lobby.scene` 删除，大厅仍不提前显示游戏卡片，步骤 25 才负责按配置生成实例。
- 未发现阻塞第 25 步的数据绑定或列表布局问题。

验证：Creator Prefab 独立编辑与视觉检查；Prefab 格式校验（5 个节点）；真实实例化和节点树检查；节点尺寸、锚点、位置、层级、组件及文本契约；全部子节点边界与两两重叠检查；Button 无点击回调；具体游戏、自定义脚本和项目资源依赖检查；Lobby 无卡片实例；重复 Prefab 清理；全部 `assets` TypeScript 严格类型检查；全部 `.meta` JSON 解析与 UUID 唯一性；Creator 资源重导入和控制台错误检查。

## 2026-08-03：第 25 步 Review

审查范围：Manifest 到卡片的绑定、列表生成与布局、Registry 过滤顺序、场景序列化引用、Prefab 行为边界和资源依赖。

结论：

- 新增 `GameCardView`，只把 `GameManifest` 的名称、简介和启用状态写入现有展示节点，并同步 Button 是否可交互；不读取配置、不加载 Bundle，也不处理点击。
- `LobbyEntry` 继续只从 `GameRegistry.getPlayableGames()` 取得清单，并按返回顺序实例化 `GameCard`；Registry 使用保持插入顺序的 `Map`，因此列表顺序与已校验配置一致。
- 禁用、设备档位不足或应用版本不满足的条目由 Registry 统一排除，大厅没有复制过滤规则；当前本地配置在 Web 中档设备与应用版本 `0.1.0` 下生成且仅生成 `placeholder` 一张可交互卡片。
- 卡片使用固定高度 `220`、间距 `24` 的确定性纵向布局，列表容器高度由卡片数量计算；空清单高度为 `0`，不会残留旧实例。
- `ContentRoot/LobbyEntry` 已序列化引用 `GameList` 与 `GameCard` Prefab；测试实例化确认 Prefab 根节点包含 `GameCardView`，测试实例随后删除，场景中只保留空容器，由运行时生成卡片。
- 修改名称、简介、顺序或启用状态只需更新清单配置并重新载入 Registry，不需要修改大厅代码。
- 本步仍使用 Prefab 内置占位图标；Manifest 图标属于具体游戏 Bundle，要等 AssetService 与占位游戏 Bundle 建立后再加载，避免大厅提前依赖尚不存在的游戏资源。
- 直接单独预览 `Lobby.scene` 时 App 不存在，列表按既定保护逻辑保持为空；正式启动后进入 Lobby 的导航链路将在后续进入游戏主流程中接通。
- Review 收口了装饰器导入和可空引用处理，没有发现阻塞第 26 步的类型错误、序列化缺失或职责泄漏。

验证：全部 `assets` TypeScript 严格类型检查（18 个文件，0 诊断）；Prefab 格式校验（5 个节点、29 个组件）；真实实例化并确认 `GameCardView` 组件；LobbyEntry 两个序列化引用回读；GameList 尺寸与锚点回读；测试实例清理；场景保存与层级复查；Creator 资源刷新后控制台 0 错误。

## 2026-08-03：第 26 步 Review

审查范围：卡片点击上报、进入请求锁的并发语义、成功与异常解锁、后续进入流程接入点、Prefab 兼容性和步骤边界。

结论：

- 新增纯 TypeScript `EnterRequestLock`，同一时刻只允许一个异步请求执行；锁内请求未完成时，后续调用直接返回 `false`，不会启动第二个请求。
- 锁通过 `finally` 统一释放，成功、同步抛错和异步拒绝都不会残留锁；异常后可以正常重试。
- `GameCardView` 只监听自身 Button 点击并把已绑定的 Manifest 上报给大厅，不直接访问 App、Session、Bundle、场景或具体小游戏。
- `LobbyEntry` 统一持有请求锁，并通过 `setEnterGameRequest()` 保留唯一进入流程接入点；第 32 步可以注入真实进入流程，无需修改卡片 Prefab 或复制防重逻辑。
- 真实进入处理器尚未接入时，点击只输出说明日志并立即返回，不制造假的 Session 或场景切换；这符合第 26 步只建立点击锁的范围。
- 进入请求失败由大厅统一记录，锁自身不吞掉异常；请求完成后的解锁不依赖场景加载结果分支。
- Review 以延迟 Promise 模拟并发点击，确认第二个请求未执行；随后覆盖成功解锁、失败解锁和失败后重试，全部通过。
- `GameCardView` 脚本 UUID 未变化，Prefab 重新实例化后组件仍可识别；测试实例已删除，Lobby 场景保持干净。
- 未实现 GameSession、Asset Bundle 加载、占位游戏或真实进入导航，步骤职责没有越界。

验证：请求进行中重复调用被拒绝；成功后解锁；异常后解锁；异常后重新请求成功；全部 `assets` TypeScript 严格类型检查（19 个文件，0 诊断）；Prefab 格式校验与真实实例化；`GameCardView` 组件 UUID 回读；测试实例清理；Creator 脚本刷新后控制台 0 错误。

## 2026-08-08：第 27 步 Review

审查范围：会话标识、游戏标识、开始时间、状态、时长计算、结果固化和重复结束保护。

结论：

- 新增纯 TypeScript `GameSession`，不依赖 Cocos、场景、Bundle、服务容器或具体小游戏。
- 每个会话默认生成由时间戳和进程内递增序号组成的 ID；连续创建会话不会复用 ID。
- 会话创建时立即记录开始时间，状态仅包含本步所需的 `active` 和 `finished`，没有提前实现加载、暂停或退出流程。
- `duration` 在活动期间按当前时钟动态计算；结束时统一使用会话时钟重算并固化到结果，调用方传入的时长不会覆盖真实会话时长。
- `finish()` 只允许成功一次；重复调用会抛出明确错误，且不会覆盖首次固化的结果。
- 最终结果及其 `extra` 浅副本被冻结，避免结束后由调用方改写已固化数据。
- 时钟和 ID 生成器可注入，以便确定性验证；默认调用无需额外依赖。
- 未实现 Asset Bundle 加载、占位游戏、导航或真实进入流程，步骤职责没有越界。

验证：连续会话 ID 唯一；活动时长和结束时长计算；调用方时长覆盖保护；结束后时长固定；重复结束拒绝且首次结果不变；负向时钟回拨保护；空游戏 ID、空 Session ID 和非法时间戳校验；全部 `assets` TypeScript 严格类型检查。

## 2026-08-08：第 28 步 Review

审查范围：Asset Bundle 单次加载、已加载缓存、同名并发合并、失败语义、失败后重试和步骤边界。

结论：

- 新增 `AssetService`，本步只公开 `loadBundle()`，没有提前实现资源预加载、引用追踪、场景加载或 Bundle 释放。
- 已由 Cocos `assetManager` 缓存的 Bundle 会直接返回，不会创建新的加载任务。
- 同一 Bundle 的并发请求共享同一个 Promise 和底层 `loadBundle` 调用；不同 Bundle 仍可各自并行加载。
- 加载成功或失败后都会移除进行中任务；清理逻辑兼容项目的 ES2015 目标，失败不会污染后续重试或产生额外的未处理拒绝。
- 回调错误、同步抛错和加载器未返回 Bundle 都统一转换为 `AssetBundleLoadError`，错误包含 Bundle 名称并保留原始原因。
- Bundle 名称会去除首尾空白，空名称在调用底层加载器前被拒绝。
- 底层 Provider 可注入，生产环境默认使用 Cocos `assetManager`，验证环境可以稳定模拟缓存、成功、失败和并发。
- 本步未将服务注册到 App，也未接入大厅点击；组合根接线留给正式进入游戏流程，避免提前扩大改动范围。

验证：已缓存 Bundle 零加载；同名并发 Promise 与底层任务合并；不同名称独立加载；成功后缓存复用；回调失败错误上下文；同步异常包装；空结果保护；失败清理后成功重试；空名称拒绝；全部 `assets` TypeScript 严格类型检查；项目 `.meta` 解析和 UUID 唯一性。

## 2026-08-08：第 29 步 Review

审查范围：占位游戏 Bundle 配置、场景结构、入口组件、退出按钮、资源隔离和 Creator 导入状态。

结论：

- 新增独立 `game-placeholder` Asset Bundle，名称与 `games.json` 的 `bundle` 字段一致，保持在主包且不配置远程 Bundle 或微信分包。
- 新增 `scenes/Placeholder.scene`，最小层级为 `Canvas/Camera/GameRoot/Title/ExitButton/ExitLabel`，包含正交相机、可见标题和具有完整点击区域的退出按钮。
- 占位场景统一使用 `UI_3D` 层；正交相机位于 `z=1000`，可见层为 `UI_3D`，远裁剪面为 `2000`，不会与常驻 App 的 `UI_2D` 系统相机串层。
- 新增 `PlaceholderGame` 入口组件并挂载到 `GameRoot`；本步仅提供可定位组件，没有提前实现第 30 步的 `MiniGame` 生命周期。
- 退出按钮包含 `cc.Button` 且点击事件为空；正式退出请求由第 33 步接入，不在占位场景中直接切换场景。
- 场景只依赖自身脚本和 Cocos 内置组件，不依赖大厅或其他小游戏 Bundle；Creator 资源数据库已识别场景和入口脚本。
- 场景由 Cocos Creator MCP 创建、修改、保存并回读验证，避免手写场景序列化；保存后场景无未提交编辑器修改，控制台无错误。
- 当前 MCP 构建接口只能打开构建面板，无法无交互触发构建；独立 Bundle 验收由 Bundle 元数据、资源数据库识别、场景依赖和场景重载检查覆盖，实际加载将在第 32 步由 `AssetService` 链路执行。

验证：`game-placeholder` Bundle 名称和主包策略；场景与脚本资源 UUID 回读；场景层级和组件挂载；标题与退出按钮 UTF-8 文本；相机位置、裁剪面、清屏和可见层；Button 无提前绑定回调；深层场景依赖为 0；Creator 保存后 dirty=false；Creator 控制台 0 错误；全部 `assets` TypeScript 严格类型检查；全部 `.meta` JSON 解析和 UUID 唯一性。

## 2026-08-08：第 30 步 Review

审查范围：占位游戏 `MiniGame` 协议实现、生命周期状态、合法调用顺序、非法顺序错误、上下文释放和可观察性。

结论：

- `PlaceholderGame` 已实现 `MiniGame` 的 `initialize/start/pause/resume/restart/dispose` 全部方法，没有增加分数、计时器、动画或真实玩法。
- 生命周期使用最小状态集合 `created/initialized/running/paused/disposed`；每个方法只接受明确的前置状态，非法顺序抛出 `PlaceholderLifecycleError`。
- 生命周期错误保留动作、当前状态和允许状态，运行层可以直接定位错误调用，不会静默忽略协议违规。
- `restart()` 支持从运行或暂停状态重开并回到运行状态；`dispose()` 支持从已初始化、运行或暂停状态释放。
- 每次成功调用都会写入只读历史快照并输出包含游戏 ID、Session ID 和状态变化的结构化日志，调用顺序可以在测试和 Creator 控制台观察。
- `dispose()` 完成后释放 `MiniGameContext` 引用；重复释放或释放后继续调用会被明确拒绝。
- 场景脚本 UUID 未变化，既有 `Placeholder.scene` 组件绑定无需修改。
- 未接入 `GameLoader`、Session、Bundle 场景切换或退出按钮行为，步骤职责没有越界。

验证：完整 `initialize → start → pause → resume → restart → dispose` 顺序；初始化后直接释放；暂停后重开；开始前暂停/启动、重复初始化、重复开始、运行中恢复、释放后调用等非法顺序；状态和只读历史；上下文释放；全部 `assets` TypeScript 严格类型检查；Creator 脚本刷新后场景组件绑定和控制台错误检查。

## 2026-08-08：首个正式游戏变更 Review

变更范围：首个正式游戏从“泡泡解压”调整为“合成大西瓜”，同步更新架构目录、Bundle 命名和第 44～54 步实施计划。

结论：

- 正式游戏目录由尚未使用的 `assets/games/bubble` 调整为 `assets/games/watermelon`，保留原目录 UUID，避免制造无意义的资源身份变化。
- 正式 Bundle 由 `game-bubble` 调整为 `game-watermelon`；当前 `games.json` 仍只登记流程占位游戏，因此无需迁移运行配置或存档。
- 新计划把玩法拆分为静态界面、水果等级配置、投放、碰撞合成、计分进度、越线结束与反馈、存档统计，仍保持每步只实现一个可验收职责。
- 合成碰撞增加单次结算锁，失败判断增加稳定越线时间，提前覆盖物理游戏常见的重复合成和瞬时误判风险。
- `MiniGame`、`GameResult`、Bundle 隔离、公共服务、运行链路和 2D/3D 架构边界均无需修改。
- 已完成的第 1～30 步和 `game-placeholder` 不受影响；后续仍从第 31 步继续建立通用加载链路。

验证：全仓库当前正式规划中不再引用 `bubble` 或 `game-bubble`；`watermelon` 目录与架构表一致；第 44～51 步覆盖合成大西瓜的完整最小闭环；第 52、54 步压力与隔离测试目标同步更新；项目 `.meta` JSON 和 UUID 唯一性检查。

## 2026-08-08：第 31 步 Review

审查范围：已加载场景中的入口组件查找、唯一性、`MiniGame` 协议校验和错误上下文。

结论：

- 新增 `GameLoader`，输入仅为已加载的 Cocos 场景和 Manifest 入口描述，不负责 Bundle、场景加载、Session 或状态切换。
- 入口按 Manifest 的 `entryComponent` 类名在完整场景树中查找，不依赖具体小游戏类或目录。
- 找不到入口、存在多个同名入口和协议方法缺失分别返回稳定错误码，错误同时包含游戏 ID 和入口类名。
- 协议校验覆盖 `initialize/start/pause/resume/restart/dispose` 全部方法；错误会列出所有缺失方法，不需要逐个失败重试。
- 正常入口以 `MiniGame` 返回，但运行时仍完成结构校验，不依赖 TypeScript 接口在构建后的存在性。
- 未实现第 32 步的创建 Session、Bundle/场景加载、上下文注入或启动调用，职责边界清晰。

验证：正常入口定位；入口位于嵌套节点；入口缺失；重复入口；单个和多个协议方法缺失；错误码、游戏 ID、组件名与缺失方法；全部 `assets` TypeScript 严格类型检查；Creator 脚本导入和控制台错误检查。

## 2026-08-08：第 32 步 Review

审查范围：启动进入大厅、进入请求接线、Session 创建、Bundle/场景加载、入口定位、上下文注入、生命周期启动、状态顺序和并发保护。

结论：

- 新增 `GameRuntime` 编排启动大厅与进入游戏；`AssetService`、`GameLoader`、`GameSession` 和状态机仍保持各自单一职责。
- App 组合根注册 `AssetService`、`GameLoader` 和 `GameRuntime`，本地配置与目录加载成功后加载 `lobby` Bundle/场景并完成 `booting → lobby`。
- `LobbyEntry` 通过既有 `setEnterGameRequest()` 接入 `GameRuntime`，卡片和大厅不直接加载 Bundle 或创建 Session。
- 进入流程固定为 `lobby → loading-game → playing`，并依次执行创建 Session、加载 Bundle、加载并运行场景、定位入口、注入上下文、`initialize()` 和 `start()`。
- 同一进入请求进行中时复用唯一任务；结合大厅点击锁，不会为快速重复点击创建多个 Session。
- Bundle、场景、入口、初始化和启动失败都保留明确阶段，清理当前 Session/入口引用并从 `loading-game` 进入 `error`，不会误进 `playing`。
- `MiniGameContext` 注入游戏 ID、Session ID、只读服务集合、分数和退出接入点；退出本步只记录未接线提示，第 33 步再实现正式流程。
- 场景加载与 Director 启动均转换为 Promise，空场景返回被明确拒绝；没有提前实现 Bundle 释放或统一加载/错误 UI。

验证：启动大厅状态与场景顺序；完整进入顺序；上下文 ID；并发进入单 Session；非法状态拒绝；Bundle/场景/入口/initialize/start 各阶段失败；失败状态不为 `playing`；全部 `assets` TypeScript 严格类型检查；Creator 脚本刷新、App/Lobby 场景绑定和控制台错误检查。

## 2026-08-08：MiniGame 启动方法命名修正 Review

变更原因：`MiniGame.start()` 与 Cocos `Component.start()` 生命周期函数同名。入口组件随场景启动时会被引擎自动调用 `start()`，早于运行层注入上下文，无法保证 `initialize → start` 顺序。

结论：

- 将小游戏协议的显式启动方法从 `start()` 改为 `begin()`，同步架构文档、协议、入口校验、运行编排和占位游戏。
- App 与 Lobby 自身的 Cocos 生命周期函数仍保留 `protected start()`，它们不实现 `MiniGame`，不受影响。
- 当前没有正式游戏或已发布存档依赖旧方法名，无兼容迁移成本；占位游戏是唯一实现，已同步修改。
- `initialize → begin` 现在完全由运行层控制，Creator 不会在场景加载时抢先调用小游戏启动方法。
- 错误阶段从 `start` 调整为 `begin`，其余状态、Bundle 和 Session 协议不变。

验证：全仓库 `MiniGame` 当前协议不再声明或调用 `start()`；Creator 场景载入不会触发 `begin()`；`initialize → begin → pause/resume/restart → dispose` 顺序与非法顺序测试；全部 `assets` TypeScript 严格类型检查。

## 2026-08-08：第 33 步 Review

审查范围：上下文退出请求、运行/暂停状态退出、结果固化、销毁、返回大厅、重复退出和占位按钮接线。

结论：

- `GameRuntime.exitGame()` 统一执行退出流程；小游戏只调用 `MiniGameContext.requestExit()`，不直接切换场景。
- 运行状态退出先调用 `pause()`，暂停状态退出不重复暂停；随后固定进入 `leaving-game`。
- Session 在销毁前固化标准 `GameResult`，未提供结果时使用当前上报分数和 `completed=false`，时长仍由 `GameSession` 统一重算。
- `dispose()` 完成后复用已缓存的大厅 Bundle 加载并运行 Lobby 场景，状态完成 `leaving-game → lobby`，最后释放当前入口、Session 和 Manifest 引用。
- 同时到达的多个退出请求共享一个任务，不会重复暂停、结束、销毁或加载大厅。
- 暂停、结果固化、销毁和大厅加载失败均保留阶段错误；可转换时进入 `error`，不会伪装成成功返回大厅。
- 占位游戏在 `initialize()` 时验证并监听 `ExitButton`，点击只调用上下文退出；`dispose()` 解除监听并释放节点和上下文引用。
- 未实现第 34 步的 Bundle 释放；退出后游戏 Bundle 暂时仍由 Cocos 缓存。

验证：playing 和 paused 两种退出；默认与显式结果；Session 时长覆盖；重复退出单任务；pause/dispose/lobby 失败；退出后引用清理；按钮缺失初始化失败；按钮点击请求退出；dispose 后监听解除；全部 `assets` TypeScript 严格类型检查；Creator 场景组件与按钮结构、脚本刷新和控制台错误检查。

## 2026-08-08：第 34 步 Review

审查范围：游戏 Bundle 资源释放、缓存移除、进行中加载竞态、释放时机、公共 Bundle 隔离和失败语义。

结论：

- `AssetService.releaseBundle()` 只释放指定名称的已加载 Bundle；不存在的 Bundle 返回 `false`，保持幂等。
- 若同名 Bundle 仍在加载，释放会先等待该加载任务完成，避免加载回调晚于移除操作造成竞态。
- 释放顺序固定为 `bundle.releaseAll()` 后 `assetManager.removeBundle()`，同时清理 Bundle 内资源和 AssetManager 缓存入口。
- 底层释放异常统一包装为 `AssetBundleReleaseError`，保留 Bundle 名称和原始原因。
- `GameRuntime` 仅在游戏 `dispose()` 完成且 Lobby 场景成功启动后释放当前 Manifest 指定的游戏 Bundle；不会向释放接口传入 `lobby`、`resources` 或共享 Bundle。
- 释放成功或失败后都清理已销毁游戏的入口、Session 和 Manifest 引用；释放失败时大厅已经可操作，错误仍向上游暴露以便记录资源泄漏风险。
- 未加入引用计数、资源预加载或统一加载 UI，步骤边界没有扩展。

验证：已加载 Bundle 的 `releaseAll → removeBundle` 顺序；不存在 Bundle 幂等；进行中加载完成后释放；加载失败传播；releaseAll/removeBundle 异常包装；退出顺序为 dispose → Lobby → release；只释放当前游戏 Bundle；释放失败后大厅状态与运行引用清理；全部 `assets` TypeScript 严格类型检查；Creator 脚本刷新和控制台错误检查。

## 2026-08-08：第 35 步 Review

审查范围：启动进大厅、进入游戏和退出游戏期间的统一加载文案、显示隐藏、全屏输入拦截及成功/失败收口。

结论：

- 新增常驻 `LoadingView`，仅负责提示文字、显隐、层级置顶和输入拦截，不参与 Bundle、Session 或状态切换。
- App 场景的 `LoadingLayer` 通过 Creator MCP 挂载 `LoadingView`、`BlockInputEvents` 和全屏 `Widget`，新增独立 `LoadingMessage`，不与启动错误文案混用。
- `GameRuntime` 通过最小 `LoadingPresenter` 接口使用加载层，不依赖具体 Cocos 组件；进入大厅、进入游戏和返回大厅均覆盖完整异步区间。
- 进入游戏按 Manifest 名称显示文案；返回大厅使用独立文案；加载层显示时自动位于常驻 Canvas 最上层。
- 每条流程都用 `finally` 关闭加载层，因此 Bundle、场景、入口、初始化、开始、销毁、大厅或释放失败均不会遗留输入遮罩。
- 加载层启用时 `BlockInputEvents` 覆盖 Canvas 全尺寸，加载期间不能继续点击大厅或游戏内容；隐藏时整个节点停用，不截获输入。
- 启动失败会重新激活 LoadingLayer 并只显示 `StartupErrorLabel`，不会被加载提示的隐藏逻辑永久遮住。

验证：启动进大厅的 show → load/run → hide 顺序；启动加载失败仍 hide；进入游戏 initialize/begin 成功后 hide；退出游戏 dispose/release 后 hide；运行状态正确；全部 `assets` TypeScript 严格类型检查；Creator 脚本识别、App 场景组件挂载、节点创建和场景保存检查。

## 2026-08-08：第 36 步 Review

审查范围：游戏加载错误展示、重试、返回大厅、恢复动作并发保护和失败 Session 隔离。

结论：

- 新增常驻 `ErrorView` 与独立 `ErrorLayer`，错误页只消费运行层提供的文案和恢复动作，不自行加载场景或修改状态。
- 游戏进入流程任一阶段失败后清理入口、Session 和 Manifest 运行引用，状态进入 `error`，随后展示统一错误页。
- 重试通过 `error → loading-game` 重新执行完整 `enterGame()`，每次都先创建新的 `GameSession`；不会复用失败 Session、入口或场景。
- 返回大厅通过既有 `enterLobby()` 执行 `error → lobby`，成功后清理失败 Manifest；若大厅加载也失败，错误页恢复显示且保留可再次操作的入口。
- 重试和返回大厅按钮在恢复动作执行期间同时禁用，避免重复操作；运行层既有进入任务合并继续提供第二层保护。
- 错误页使用全屏 `Widget` 与 `BlockInputEvents`，显示时阻断下层输入；开始重试时由加载页接管，成功后错误页保持关闭，失败则更新并重新显示。
- ErrorLayer、错误文案、重试按钮、返回大厅按钮及标签均通过 Creator MCP 创建和保存，脚本绑定与层级检查通过。

验证：首次 Bundle 失败进入 `error` 并清空 Session；重试成功进入 `playing`；两次尝试的 Session ID 不同；返回大厅成功进入 `lobby`；按钮恢复模型和错误页层级；全部 `assets` TypeScript 严格类型检查；Creator 场景无未保存修改。

## 2026-08-08：第 37 步 Review

审查范围：版本化用户存档、首次默认值、结构校验、损坏恢复、写入失败和游戏命名空间隔离。

结论：

- 新增 `StorageService`，根存档固定包含 `schemaVersion`、音频/振动设置和按 gameId 分隔的 `games` 数据。
- 首次读取不存在的数据时立即生成并写入默认存档；JSON 损坏、字段缺失、类型错误或非法游戏数据会恢复默认值并覆盖无效内容。
- 读取后的根对象、设置、游戏表、单游戏数据和 custom 浅层均冻结，业务不能绕过服务直接修改内存快照。
- `writeGameData()` 每次只替换目标 gameId，保留其余游戏数据；空 gameId 和不合法的 dataVersion、playCount、分数或 custom 会被拒绝。
- `writeSettings()` 只接受完整布尔设置；所有提交都先持久化成功再替换内存快照，写入异常包装为 `StorageWriteError`。
- App 在平台初始化后、配置与大厅加载前完成存档加载，并通过服务容器注册，小游戏后续只能经注入服务访问。
- 本步只接受当前 schemaVersion；旧版本逐级升级与迁移失败备份留到第 38 步。

验证：首次启动默认数据和一次落盘；损坏 JSON 恢复并生成可解析存档；两个游戏先后写入互不覆盖；重复更新单游戏保留另一游戏；只读冻结；严格类型检查；Creator 资产刷新与脚本导入。

## 2026-08-08：第 38 步 Review

审查范围：根存档逐级迁移、v1→v2 示例、迁移产物校验、原始数据备份和备份失败语义。

结论：

- 当前根存档版本提升为 v2，架构文档先行记录版本和迁移规则；默认新存档直接写入 v2。
- 迁移器只允许 `vN → vN+1`，逐步查找并执行注册函数；缺少中间迁移、产出版本跳跃和比应用更新的存档均明确失败。
- 示例 v1→v2 保留全部游戏数据和既有设置，并为早期缺失的 `vibrationEnabled` 补默认值 `true`。
- 全部迁移完成后仍必须通过当前 UserData 完整结构校验，只有校验成功才覆盖主存档。
- 迁移失败时先将来源版本、目标版本、原因和原始字符串写入独立 `.migration-backup` 键，再恢复默认主存档。
- 若备份本身写入失败，抛出 `StorageMigrationError` 并停止恢复流程，原主存档保持未修改，避免无备份覆盖。
- 普通损坏 JSON 或当前版本结构错误继续使用第 37 步的默认恢复语义，不误标成历史迁移失败。

验证：v1 缺省振动设置逐级迁移至 v2；游戏数据保留；成功后主存档版本更新；无 v0 迁移时生成包含原文的备份并恢复默认；模拟备份写入失败时抛错且原主存档不变；严格类型检查与 Creator 资产刷新。

## 2026-08-08：第 39 步 Review

审查范围：背景音乐、单次音效、总开关、独立开关、设置持久化及前后台暂停恢复。

结论：

- 新增 `AudioService`，通过独立 MusicChannel 和 EffectChannel 复用常驻 `AudioSource`，不在每次播放时创建新节点或新实例。
- 相同背景音乐正在播放时重复请求被忽略；切换曲目时先停止旧曲，设置循环后只启动一次。
- 音效统一使用 `playOneShot()`，音量缩放限制在 0～1；关闭音效后请求直接忽略。
- 总开关同时更新音乐与音效，独立开关也可使用；每次最终设置通过 `StorageService.writeSettings()` 保存，并保留振动配置。
- 音乐关闭时暂停当前曲目，重新开启时从同一通道恢复；停止音乐会同时清除 clip 和前后台恢复标记。
- App 的平台隐藏事件只暂停一次并记录是否确由后台触发；回前台只恢复一次，不会叠加播放；销毁组合根时停止两个通道。
- App 场景的 AudioRoot 通过 Creator MCP 创建 MusicChannel、EffectChannel 与 AudioSource，代码保留缺失节点时的安全创建逻辑。

验证：相同 BGM 重复请求仅播放一次；切歌停止旧曲；单次音效及音量限制；总开关保存且静音后不播音效；关闭/开启音乐恢复；重复 hide/show 不重复 pause/play；严格类型检查；Creator 资产刷新和 App 场景保存。

## 2026-08-08：第 40 步 Review

审查范围：统计事件模型、公共字段、开发日志适配、Session 结束去重及厂商隔离。

结论：

- 新增 `AnalyticsService` 和最小 `AnalyticsTransport`，业务只提交事件名与属性，不引用任何统计厂商 SDK。
- 每个事件自动补充时间戳、应用版本、平台 ID 和设备性能档位；属性和最终事件对象均冻结。
- 开发适配器 `ConsoleAnalyticsTransport` 每次只输出一个结构化事件对象，便于控制台筛选和后续替换正式传输层。
- `trackGameEnd()` 强制非空 Session ID，并在服务层对同一 Session 去重；重复结束返回 `undefined`，不会再次发送。
- 已结束 Session 缓存限制为 512 条，避免长期运行无界增长；Session ID 本身全局唯一，淘汰旧项不影响活跃对局。
- App 组合根注册统计服务，公共字段通过只读上下文函数动态取得，配置加载后可获得当前 appVersion。
- 本步未自动埋入具体游戏事件，正式合成大西瓜的开始、结束、重开和退出在第 51 步接入。

验证：普通事件公共字段补全；时间戳可注入；事件和属性冻结；相同 Session 两次结束只发送一次；结束属性包含 Session ID；空事件名拒绝；严格类型检查和 Creator 资产刷新。

## 2026-08-08：第 41 步 Review

审查范围：广告服务协议、可配置模拟结果、并发展示、游戏暂停恢复、后台竞态及异常归一化。

结论：

- 新增厂商无关 `RewardedAdProvider` 和 `AdService`，业务只接收 `completed`、`skipped`、`failed` 标准结果。
- `MockRewardedAdProvider` 可设置下一次广告结果和错误文本，每次消费后自动恢复默认“完整观看”，方便开发与自动测试。
- 广告从 `playing` 发起时由服务执行 `playing → paused`；若发起前已经暂停或处于大厅，服务不会声称拥有暂停权，也不会擅自恢复。
- 同一时间的重复展示请求共享一个 Promise，Provider 只调用一次。
- Provider 抛出的异常统一转换为 `failed` 结果，游戏仍按暂停所有权恢复，不把厂商异常泄漏给业务流程。
- 广告期间进入后台时延迟恢复；回前台后仅在仍处于 `paused` 时恢复一次，避免隐藏状态误进 `playing` 或叠加恢复。
- App 将广告服务接入与音频相同的平台显隐回调并注册到服务容器；当前仅使用模拟 Provider，不接真实广告 SDK。

验证：完整观看、跳过、显式失败和 Provider 抛错；播放前后状态；初始暂停不恢复；并发请求单 Provider 调用；广告期间隐藏后保持暂停、回前台恢复；严格类型检查和 Creator 资产刷新。

## 2026-08-08：第 42 步 Review

审查范围：公共暂停层、继续、重新开始、退出、按钮并发保护、Session 更新和小游戏节点隔离。

结论：

- 新增常驻 `PauseView` 和 `PauseLayer`，只消费 `PauseMenuModel` 的三个异步动作，不查找或控制任何具体小游戏节点。
- `GameRuntime.openPauseMenu()` 是统一入口：运行中先调用 MiniGame 协议的 `pause()`，再执行 `playing → paused`；已暂停时重复打开不会再次 pause。
- 继续操作调用协议 `resume()` 并完成 `paused → playing`，成功后才关闭弹窗；协议异常保留 paused 状态和操作入口。
- 重新开始通过标准退出流程销毁旧入口、结束旧 Session、回大厅并释放 Bundle，再完整进入同一 Manifest；新一局获得新 Session 和新上下文。
- 退出操作同样通过 `exitGame()` 固化未完成结果并回大厅，不由弹窗直接切换场景。
- 三个按钮在任一动作执行期间同时禁用，避免重复恢复、重开或退出；运行层的进入/退出任务合并继续提供二级并发保护。
- PauseLayer 通过 Creator MCP 创建全屏输入遮罩、标题、继续/重开/退出按钮与标签，并挂载 PauseView 后保存。

验证：打开暂停时协议与状态顺序；继续恢复 playing；重开后仍为 playing 且 Session ID 改变；旧入口 dispose、Bundle release；暂停退出后为 lobby 且 Session 清空；Creator PauseLayer 完整层级、脚本组件和场景无脏修改；严格类型检查。

## 2026-08-08：第 43 步 Review

审查范围：标准结果固化与展示、完成请求路由、再来一局、返回大厅和玩法数据隔离。

结论：

- 新增常驻 `ResultView` 与 `ResultLayer`，界面只读取标准 `GameResult.score`、`duration`、`completed`，不认识水果等级或其他游戏私有结构。
- 小游戏通过既有 `MiniGameContext.requestExit(result)` 提交 `completed=true` 结果时，运行层改为暂停当前入口、固化 Session 并显示结果，不立即销毁游戏场景。
- `GameSession.finish()` 仍统一重算实际 duration，调用方传入的时长不会污染标准结果；extra 只作为只读附加信息保留，不参与公共 UI。
- 同一局重复完成会被拒绝，避免重复结果页和重复 Session 结算；结果展示期间也不能再打开暂停菜单。
- 再来一局先按标准退出流程销毁已完成旧局并释放 Bundle，再完整进入同一 Manifest，生成全新 Session。
- 返回大厅复用已固化结果，不会第二次调用 `session.finish()`；随后 dispose、加载大厅、释放游戏 Bundle 并清理运行引用。
- ResultLayer 通过 Creator MCP 创建全屏输入遮罩、结果文案、再来一局和返回大厅按钮，挂载脚本并保存。

验证：completed 请求进入 paused 并显示结果；分数、完成标记和 extra 保留；duration 由 Session 重算；重复 finish 拒绝；重开后 Session ID 改变且状态 playing；第二局结算后返回 lobby 并清空 Session；Creator ResultLayer 层级与场景保存；严格类型检查。

## 2026-08-08：第 44 步 Review

审查范围：合成大西瓜独立资源目录、Asset Bundle 元数据、入口场景和占位游戏依赖隔离。

结论：

- `assets/games/watermelon` 已配置为独立 `game-watermelon` Asset Bundle，优先级与现有游戏 Bundle 一致。
- Bundle 内建立 scenes、scripts、prefabs、configs 四个自有目录，后续正式玩法代码和资源不散落到公共或占位模块。
- 通过 Creator MCP 创建并验证 `Watermelon.scene`，场景 UUID 和目录 `.meta` 均由 Creator 资产系统生成。
- 当前 Bundle 内未出现 `placeholder` 或 `game-placeholder` 引用，也未复制占位场景、脚本或资源。
- 本步只建立 Bundle 和空入口场景，未提前加入静态界面、物理、玩法或 Manifest 登记。

验证：根目录 `isBundle=true`、`bundleName=game-watermelon`；四个子目录与 meta 存在；Watermelon.scene 可被 Creator 查询；Bundle 全文无占位游戏引用。

## 2026-08-08：第 45 步 Review

审查范围：合成大西瓜竖屏静态界面、玩法区域、顶栏、警戒线、下一水果预览、暂停入口和比例适配。

结论：

- Watermelon.scene 已建立独立 2D Canvas、正交 UI Camera 和 GameRoot；Canvas 明确绑定 Camera，Camera 只渲染 UI_2D 层。
- 顶栏包含游戏标题、当前分数、下一个水果标签与预览、暂停按钮；玩法区包含投放提示、FruitContainer、失败警戒线和底部说明。
- 新增纯展示 `WatermelonLayout`，只计算静态布局和绘制容器背景/边框，不创建水果、不接输入、不执行物理或计分。
- 布局采用固定宽度思路，最小保护高度 1100；更高竖屏只增加玩法容器高度，顶栏和底部提示始终保留边距。
- FruitContainer 宽度受 Canvas 宽度和 650 上限共同限制，警戒线相对容器顶部定位，不会随长屏漂到系统 UI 区域。
- 全部场景节点、标签、按钮、Camera 参数和脚本挂载通过 Creator MCP 完成并保存。

验证：750×1334、750×1624、828×1792、600×1100 四组布局边界；长屏玩法区确实增高；投放区始终位于容器上方；底部说明位于安全边距内；Canvas Camera 绑定、正交高度与 UI 可见层；严格类型检查。

## 2026-08-08：第 46 步 Review

审查范围：水果等级链、唯一性、尺寸、质量、密度、摩擦、弹性、分值、初始池和逐级 Prefab。

结论：

- 定义从樱桃到西瓜的 11 个连续等级，level 固定为 0～10，ID 唯一且显示名、颜色、半径、质量、密度和分值完整。
- 每级只指向紧邻的下一等级；最高级西瓜不含 nextLevel，禁止继续越级合成。
- 初始生成池明确限制为 0～4 级，苹果及以上只能通过后续合成产生。
- 摩擦、弹性、质量和由质量/圆面积计算的密度统一写入只读配置，`FruitBody` 在实例激活时应用到 RigidBody2D 与 CircleCollider2D。
- 每级都有独立 `prefabs/fruits/fruit-NN-id.prefab`，包含 UITransform、Graphics、RigidBody2D、CircleCollider2D 和对应 level 的 FruitBody。
- Prefab 只描述水果自身，没有在 Watermelon.scene 预放或运行时生成水果；临时作者节点已从场景清理。
- `validateFruitCatalog()` 可在构建和测试中检查等级断裂、重复 ID、物理字段缺失和 nextLevel 错误。

验证：11级连续唯一；前5级可初始生成、其余不可；全部正尺寸/质量/密度/分值；最高级无 nextLevel；未知等级拒绝；Creator Prefab 列表为11个且逐个格式校验无问题；场景无作者临时水果；严格类型检查。

## 2026-08-08：第 47 步 Review

审查范围：当前/下一个水果、初始生成池、横向瞄准、边界夹紧、松手投放、输入锁和物理容器。

结论：

- 新增 `WatermelonGame` 正式入口并挂载到 GameRoot；初始化时从 `game-watermelon` Bundle 加载11个自有 Prefab，不跨 Bundle 取资源。
- 当前水果和下一个水果始终从0～4级初始池选取，预览颜色与尺寸由统一 FruitCatalog 配置驱动。
- 触摸在 FruitContainer 内转换为本地坐标，投放 x 按“容器半宽－当前水果半径－边距”夹紧，大水果也不会越墙生成。
- 松手只实例化当前等级对应 Prefab，并放在容器顶部安全位置；随后当前等级接替上一个 next，立即生成新的 next 预览。
- `DropGate.tryConsume()` 对一次投放原子加锁；冷却结束前后续 TOUCH_END 都返回 false，上一水果释放前不能重复投放。
- 场景增加 CurrentFruitPreview 与左、右、底三面静态 BoxCollider2D；运行时按自适应容器尺寸更新墙体，不在长屏比例下留下物理缺口。
- 暂停按钮只调用新增的 `MiniGameContext.requestPause()`，正式游戏不导入 App、状态机或公共弹窗组件。
- pause/resume/restart/dispose 均清理或恢复输入状态与监听；dispose 解除全部触摸、暂停按钮和定时回调。

验证：随机值边界只产生0～4级；不同半径的左右夹紧；容器窄于水果时回到中心；DropGate 未启用、首次消费、重复消费、重新启用和禁用；Creator 入口脚本、预览和三面墙节点；全部 assets 严格类型检查。

## 2026-08-08：第 48 步 Review

审查范围：2D 接触监听、同级判定、双方锁定、重复回调、稳定合成位置、不同等级和最高级保护。

结论：

- FruitBody 在自身 CircleCollider2D 上监听 BEGIN_CONTACT，只把另一 FruitBody 交给 WatermelonGame，不在 Prefab 内决定合成或计分。
- `tryLockMergePair()` 要求两个不同实例、等级相同、双方均未锁定且配置存在 nextLevel，其他组合全部无副作用返回。
- 首次合法碰撞会立即锁定双方并禁用 Collider/RigidBody；物理引擎对同一接触的反向或重复回调随后因锁定被拒绝。
- 实际销毁和实例化延后一帧执行，避免在物理接触回调栈内修改世界；新水果在两者位置中点生成，减少突跳和偏置。
- 销毁前再次检查游戏未 dispose 且两个节点仍有效；已销毁、已锁定或场景退出中的节点不会二次结算。
- 不同等级完全不合成；10级西瓜没有 nextLevel，因此相撞也不锁定、不销毁、不生成越级节点。
- 新合成水果复用统一 `spawnFruit()`，继续绑定碰撞处理器，支持自然连锁合成。

验证：同级2→3且双方各锁一次；反向重复回调无结果；不同等级不锁；最高级不锁；同一对象不合成；FruitBody 接触监听和销毁解除；严格类型检查与 Creator 脚本刷新。

## 2026-08-08：第 49 步 Review

审查范围：合成计分、本局最大水果等级、连锁累加、分数上报、UI 更新及重开重置。

结论：

- 新增独立 `WatermelonRoundProgress`，集中维护 score 和 maxFruitLevel；返回快照冻结，UI 和后续存档不能绕过方法修改。
- 普通投放只更新最大等级，不加合成分；每次成功合成按“生成出的新等级”配置分值累加。
- 合成完成、两个旧节点销毁且新节点成功生成后才记分，碰撞锁失败、不同等级和失效节点均不会提前加分。
- 连锁合成每一次都会单独调用 recordMerge，因此分数按等级逐次累加，最大等级只增不减。
- 每次进度变化同步更新 ScoreLabel 并通过 MiniGameContext.reportScore 上报运行层，不直接访问公共结果页。
- 新一局 resetRound 与协议 restart 都将分数和最大等级重置为0，并立即上报0；不会继承上一 Session 进度。
- 生成10级西瓜可正常获得该等级分值并记录最大等级；由于第48步没有 nextLevel，不会继续计分或越级。

验证：初始0/0；投放4级只更新最大等级；2级、3级连锁分数6+10=16；再生成10级累计82且最大10；快照冻结；reset完全归零；非法11级拒绝；严格类型检查。

## 2026-08-08：第 50 步 Review

审查范围：稳定越线、短暂越线恢复、单次结束、标准结果、公共结果页、投放/碰撞/合成/失败反馈和振动设置。

结论：

- 新增 `OverflowGuard`，只有“存在未锁定水果越过警戒线且速度低于稳定阈值”连续保持1.5秒才触发失败。
- 任一帧不再满足稳定越线即把累计时间清零，因此刚投放经过顶部、弹跳或短暂堆高不会误判。
- Guard 首次达到阈值后锁定完成状态；WatermelonGame 另有 gameEnding 和 DropGate 双重保护，结束结果只提交一次且不再接受投放。
- 失败结果使用标准 `GameResult`：score 为当前分数、completed=true，extra 只附带 reason=overflow 和 maxFruitLevel；公共 ResultView 可直接展示。
- 新增公共 `FeedbackService`，统一接收 drop、collision、merge、failure cue；小游戏不导入 Platform、WebPlatform、WeChatPlatform 或 `wx.*`。
- 投放、任意水果接触、成功合成和失败均已接入 cue；声音通过可注册 AudioClip 复用 AudioService，振动强度分别为轻/中/重，普通碰撞不振动。
- FeedbackService 每次播放即时读取 StorageService 的 vibrationEnabled；开关写入后下一次反馈立即生效。音效开关继续由 AudioService 即时判断。
- App 将 audio、feedback、storage、analytics、ads 作为只读 GameServices 注入运行层，正式游戏只依赖所需的 feedback 子接口。

验证：0.8秒越线后恢复不结束；1.49秒不结束、再0.01秒只触发一次；reset 后可重新判定；四类 cue、音效注册和轻/中/重振动；关闭振动立即不触发、重开立即恢复；Watermelon 代码无平台直接调用；严格类型检查和 Creator 刷新。

## 2026-08-08：第 51 步 Review

审查范围：合成大西瓜游玩次数、最高分、历史最大等级、开始/结束/重开/退出事件、退出原因和去重。

结论：

- 游戏 Manifest 已从流程占位项替换为唯一启用的 `watermelon`，指向 `game-watermelon/scenes/Watermelon` 和 WatermelonGame；大厅现在展示正式游戏。
- 每次 begin（以及协议内 restart）只写一次开始存档：playCount +1、lastPlayedAt 更新，既有 highScore、历史最大等级和其他 custom 字段保留。
- 只有稳定越线完成时调用 `refreshCompletedWatermelonSave()`；只有分数或最大等级刷新纪录才追加一次存档写入，中途退出不刷新最高分。
- 完成刷新取旧值与本局值最大值，低分或低等级结果直接返回原对象，不产生重复持久化。
- GameRuntime 在成功进入后统一发 game_start；完成时立即发 game_end；公共重开动作发 game_restart；手动中途退出另发 game_exit。
- 每个 game_end 带 gameId、sessionId、score、completed 和 reason；稳定越线为 overflow，中途退出为 exit，重开为 restart，可明确区分。
- 结果页后续重开/回大厅会再次经过退出流程，但 AnalyticsService 按 Session ID 去重，已完成 Session 的 game_end 不会重复。
- 统计仍通过厂商无关 AnalyticsService，正式游戏不引用统计 SDK；存档只写 `watermelon` 命名空间，不覆盖其他游戏。

验证：开始后 playCount+1且保留旧字段；低纪录完成不写新对象；新纪录同时更新 highScore/maxFruitLevel；两次 start 对应两个 Session；overflow end 立即且只一次；结果重开有 restart、旧 end 不重复；第二局中途退出有 exit 且 completed=false/reason=exit；Manifest 校验与 Creator 脚本识别；严格类型检查。

## 2026-08-08：第 52 步 Review

审查范围：合成大西瓜连续进入/退出30次、Session、入口监听、运行引用、Bundle 释放和统计事件。

结论：

- 通过同一 GameRuntime 和 watermelon Manifest 连续完成30次 `lobby → loading-game → playing → leaving-game → lobby`，中途无状态失败。
- 30次进入产生30个唯一 Session ID；每次退出后 currentSession 和 currentEntry 都为 undefined，没有多个活动 Session。
- 测试入口在 initialize 增加监听计数、dispose 减少；每轮结束均回到0，最终 activeListeners=0、activeEntries=0、disposed=30。
- 每轮大厅成功启动后只释放一次 game-watermelon，最终 releaseBundle=30；未出现 lobby 或公共 Bundle 误释放。
- game_start、game_end、game_exit 均各30条；30条 game_end 的 Session ID 全部唯一，无重复结束上报。
- 合成大西瓜当前没有循环背景音乐；反馈只使用复用的一次性音效通道，退出路径无新增 AudioSource 或残留音乐所有权。
- 本步骤验证的是可自动化生命周期与引用计数不增长；微信真机 CPU/GPU/系统内存曲线按用户要求留到第56步手工验证。

验证结果：`cycles=30, sessions=30, disposed=30, releases=30, activeListeners=0, activeEntries=0, gameEndEvents=30, status=passed`；全部 assets 严格类型检查。

## 2026-08-08：第 53 步 Review

审查范围：独立3D Bundle、场景、Camera、方向光、3D刚体、基本投球玩法、Shader预热、三档画质和 Manifest。

结论：

- 新增独立 `assets/games/blocks3d` 与 `game-blocks3d` Bundle，只包含自身 scenes、scripts、materials；大厅代码、GameLoader 和 MiniGame 生命周期协议未修改。
- Blocks3D.scene 通过 Creator MCP 创建 GameRoot、World、透视 Camera 和 DirectionalLight，并挂载 Blocks3DGame。
- initialize 阶段在 begin 前创建 builtin-standard 三套材质和箱体/球体 Mesh，先完成 Shader/几何准备，再构建可见物理世界。
- begin 动态建立静态地面和积木墙；点击最多发射3个带 SphereCollider/RigidBody 的球，积木使用动态 RigidBody/BoxCollider。
- 积木倾斜超过25度或跌落即按10分计入一次；三球后延迟结算标准 GameResult，extra 仅包含 toppledBlocks 和 qualityTier。
- 低/中/高档分别使用6/10/15块积木、12/16/24球体细分，高档开启实时阴影，低中档关闭；质量选择入口封装在模块内。
- pause/resume 只切换本模块动态刚体；restart 重建 World；dispose 清理输入、节点、刚体数组、材质与 Mesh，不持有跨场景GPU资源。
- games.json 只新增 blocks3d Manifest，原 watermelon 条目和2D Bundle保持不变。

验证：三档积木数、阴影和细分严格递增；画质对象冻结；Manifest 同时得到 watermelon/2d 与 blocks3d/3d；Creator 场景包含 Camera、MainLight、World 和 Blocks3DGame 且无脏修改；全部 assets 严格类型检查。

## 2026-08-08：第 54 步 Review

审查范围：2D/3D交替进入、Camera、Layer、物理、Shader、运行资源、分数、存档命名空间和 Bundle 独立释放。

结论：

- 使用同一 GameRuntime 按 watermelon→blocks3d 顺序循环5轮，共完成10次交替进入和退出，全部回到同一 lobby 状态。
- 每次游戏活动期间只登记1套 Camera、Layer、物理世界、Shader 和入口；退出后五类活动资源计数全部归零。
- Watermelon 使用 UI Camera/UI_2D/Box2D/Graphics 路径，Blocks3D 使用透视 Camera/DEFAULT/3D RigidBody/builtin-standard；测试标识从未同时存在。
- 2D分数固定验证为111、3D分数222，每轮退出后的标准结果均匹配当前游戏，不继承上一游戏分数。
- 模拟存档分别写入 watermelon 和 blocks3d 键，各自 playCount=5，对象引用不同；模块源码交叉关键词扫描也无互相导入。
- 每次退出后 loaded Bundle 集合只剩 lobby；game-watermelon 和 game-blocks3d 分别精确释放5次，未互相释放或误释放大厅。
- 两个场景通过 Creator 依赖分析均未报告跨游戏依赖；各自脚本、场景和专属资源仍位于独立 Bundle 根下。

验证结果：`alternations=10, watermelonReleases=5, blocks3dReleases=5, activeResources=0, watermelonSaves=5, blocks3dSaves=5, status=passed`；10条 game_end 无状态或资源残留；严格类型检查。

## 2026-08-08：第 55 步 Review

审查范围：Cocos 3.8.8 Bundle 配置、微信小游戏平台覆盖、两个正式游戏的分包绑定、微信构建产物和微信开发者工具加载。

结论：
- 已在“项目设置 → Bundle 配置”创建 `微信小游戏分包` 配置，并只为 `wechatgame` 平台覆盖 `compressionType=subpackage`；其他平台继续使用 `merge_dep` 回退配置。
- `game-watermelon` 与 `game-blocks3d` 的目录元数据均绑定同一个专用 Bundle 配置 ID，两个 Bundle 名称保持唯一，仍可由运行时分别加载和释放。
- Cocos Creator 3.8.8 微信小游戏构建成功，产物位于 `build/wechatgame`；`game.json` 声明两个不同分包根路径：`subpackages/game-watermelon/` 与 `subpackages/game-blocks3d/`。
- `src/settings.json` 的 `assets.subpackages` 精确包含 `game-watermelon`、`game-blocks3d`；两个分包均包含自身 `config.json`、`game.js` 和专属 `import` 资源目录。
- 主包 `assets` 仅包含 `main`、`internal`、`resources`、`lobby`、`game-placeholder`，不包含两个正式游戏的专属资源目录。
- 已安装的微信开发者工具 CLI 成功开启本机服务端口并加载 `build/wechatgame`，返回 `IDE 启动成功` 与 `open` 成功；第 56 步真机验证未执行。

验证结果：`game.json.subpackages=[game-blocks3d, game-watermelon]`；`settings.assets.subpackages=[game-blocks3d, game-watermelon]`；主包隔离通过；微信开发者工具加载通过；严格停在第 55 步。

## 2026-08-09：第 56 步 Review

审查范围：微信真机冷启动、安全区、两个游戏分包、弱网、前后台切换、音效、振动、2D/3D 画质路径、CPU/GPU/内存表现和错误恢复。

结论：

- 用户确认已在微信真机完成第 56 步及计划规定的验收范围。
- 真机已完成“冷启动 → 大厅 → 合成大西瓜 → 返回大厅 → 3D 推倒积木 → 返回大厅”的运行闭环。
- 冷启动、安全区、独立分包加载、前后台暂停恢复、音效和振动均按计划完成检查。
- 2D 与 3D 游戏分别走到对应渲染和画质路径，退出后仍可回到可操作大厅。
- 弱网或加载异常下能够恢复到可操作状态，不需要重启微信小游戏，满足本步骤核心验收条件。
- 本仓库未留存设备型号、网络参数、帧率、CPU/GPU 峰值和系统内存曲线等原始量化记录；本条结论的证据等级为用户完成的人工真机验收。量化性能基线和多机型矩阵留到测试、提审与发布计划补齐，不作为架构阶段关闭阻塞项。

验证结果：第 56 步由用户于 2026-08-09 确认通过；微信真机完整闭环通过；错误可恢复性通过；第一阶段 56 个步骤全部完成。

## 2026-08-09：第一阶段关闭 Review

审查范围：第一阶段完成条件、首期质量门禁、后续架构约束、已知风险和下一阶段入口。

结论：

- 第 1～56 步均已完成并具有对应 Review 记录或人工真机验收确认。
- 第二款 3D 游戏未要求大厅或核心加载流程建立第二套实现，2D/3D 生命周期、Bundle、资源、存档和分数隔离成立。
- 微信主包、两个游戏分包、开发者工具和真机运行闭环均已打通。
- 后续内容生产继续遵守 `ARCHITECTURE.md` 中的平台边界、MiniGame 协议、独立 Bundle、统一 Session 和可释放生命周期，不以内容需求反向耦合核心层。
- 剩余风险主要是缺少量化真机性能曲线、正式多机型兼容矩阵、正式美术与动效、商业化、数据平台以及提审发布验证；这些风险已分别路由到后续独立计划。

阶段结论：第一阶段完成。下一阶段进入 `CONTENT_PRODUCTION_PLAN.md`；具体产品范围以后续确认并记录的第二阶段计划为准。

## 2026-08-09：第二阶段范围调整 Review

审查范围：第二阶段产品目标、首发游戏数量、大厅、合成大西瓜、UI、美术、广告和用户可玩质量门槛。

结论：

- 用户确认第二阶段不以扩充游戏数量为重心，改为集中完成大厅和“合成大西瓜”，目标是形成第一个可交给真实用户完整游玩的版本。
- 原计划中的 3D 推倒积木产品化和第 3 款正式小游戏整体移出本阶段；`blocks3d` 继续保留为架构回归样例，但不在首发大厅向普通用户展示。
- 大厅正式内容、合成大西瓜完整玩法、正式 UI/美术/反馈和微信广告被纳入同一阶段，不再分别等待后续视觉或商业化计划。
- 广告首发边界限定为“单局一次激励视频续玩 + 受控局间插屏”；首局不强制插屏，广告失败不得阻塞重开、结算或返回大厅。
- 正式广告仍经平台无关 `AdService` 与 Provider 边界接入；小游戏和大厅不得直接调用 `wx.*`，浏览器环境保留可控 Mock。
- 第二阶段完成标准从“生产 3 款游戏”改为“大厅与合成大西瓜达到用户试玩候选版本”，并加入多档真机量化记录与小规模真实用户试玩。

计划结论：`CONTENT_PRODUCTION_PLAN.md` 已重写为 37 个顺序步骤，范围已确认，后续从第 1 步开始执行。

## 2026-08-09：第二阶段大厅布局约束 Review

审查范围：大厅游戏卡布局、游戏展示权重、奇数卡片排列和首发单卡状态。

结论：

- 用户确认大厅游戏列表使用固定双列网格，不设置主推游戏。
- 所有游戏卡使用相同尺寸、信息层级和交互权重；不使用跨列大卡、主推角标或专属开始入口。
- 卡片按从左到右、从上到下排列；奇数尾项保留在左列，不跨列、不居中放大，避免形成隐性主推。
- 首发普通用户目录即使暂时只有“合成大西瓜”，也继续使用标准双列网格规则；后续增加游戏无需切换大厅布局模型。
- 游戏展示与隐藏仍由 Manifest/配置控制，大厅不得硬编码具体游戏 ID。

计划结论：第二阶段第 5、8、11 步及完成条件已同步更新，后续大厅实现以统一双列卡片为验收基线。

## 2026-08-09：第二阶段素材来源策略 Review

审查范围：大厅与游戏 UI、美术、字体、图标、音效素材的来源、许可、可追溯性和 Bundle 归属。

结论：

- 用户确认项目专属背景、游戏封面、水果和装饰插画优先通过 ImageGen 按统一视觉规范生成，不从来源不明的网站或其他游戏直接取用。
- 按钮、卡片底板、面板、进度条等基础控件优先使用 Cocos 原生节点、`Graphics`、纯色 Sprite 和九宫格制作，减少不必要的图片资源和适配成本。
- 通用图标和中文字体只采用许可证明确且允许当前项目用途与分发方式的资源；许可未核对前只能作为开发占位。
- 音效与音乐同样要求原创、生成或许可证明确，虽然与 UI 图片分开管理，但必须进入统一的素材来源审查。
- 第二阶段新增素材台账，记录用途、来源、原始地址或生成提示词、作者/模型、许可证、日期、修改记录、仓库路径和 Bundle 归属。
- ImageGen 生成物需要保留提示词与后处理记录；任何用户可见素材在进入候选构建前必须做到来源可追溯。

计划结论：第二阶段执行规则、视觉规范步骤、大厅背景步骤、水果资源步骤和完成条件已同步加入素材来源与许可验收。

## 2026-08-09：第二阶段第 1 步 Review

审查范围：第二阶段首发产品范围、普通用户主路径、异常恢复路径、开发回归边界和范围变更控制。

结论：

- 已新增 `SECOND_PHASE_SCOPE.md`，冻结“微信冷启动 → 大厅 → 首次引导 → 合成大西瓜 → 暂停/继续 → 失败/续玩 → 结算 → 重开/回大厅”的首发闭环。
- 普通用户首发内容只包含“合成大西瓜”；大厅继续使用统一双列标准卡规则，单张首发卡保留在左列，不设置主推样式。
- `blocks3d` 明确仅保留为架构与 3D 开发回归样例，不进入第二阶段的产品需求、UI、美术、玩法调优、广告和用户试玩范围。
- 开发回归内容必须由开发配置或调试入口显式开启；候选构建和普通用户大厅不得展示。实际目录配置修改仍严格留在第 11 步，本步骤未提前改动运行时配置。
- 已明确加载失败、广告失败/跳过/超时/不可用和前后台切换的恢复原则，所有分支最终回到游戏、结算或可操作大厅，不允许形成死路。
- 已冻结首次引导、单局一次激励续玩、首局不强制插屏、大厅配置驱动和平台能力边界等后续步骤共同依赖的产品决策。
- 新增首发游戏、扩大 3D 游戏范围、引入账号或在线系统、改变广告类型或修改主路径均需先走文档 Review 和变更控制。

验证结果：主路径覆盖计划要求的全部节点；普通用户与开发回归范围边界明确；异常分支均有恢复目标；未提前实施第 2 步及后续 UI、玩法、目录或广告改动。第二阶段第 1 步通过。

## 2026-08-09：第二阶段首次游戏引导范围变更 Review

变更原因：用户确认首发版本不需要首次游戏引导，首次进入应与后续进入一致，加载完成后直接开始游玩。

结论：

- 已从第二阶段主路径、阶段目标和完成条件中移除首次引导节点，正式路径调整为“启动 → 大厅 → 合成大西瓜 → 暂停/续玩 → 结算 → 重开/回大厅”。
- 首次和后续进入均不显示新手引导弹层、不执行分步教学，也不要求用户额外确认后才能开始投放。
- 第 18 步不再保存首次引导状态，避免引入无用途的存档字段和迁移成本。
- 原第 21 步调整为“实现直接开局与首局可理解性”；核心规则通过 HUD、瞄准与投放反馈、合成反馈和危险线提示自然表达，不使用阻断式教学。
- 第 32 步和阶段完成条件同步改为验证“首次进入直接开局”，后续测试不再包含引导出现、跳过或持久化用例。
- 本次只更新已冻结的产品范围与后续计划，没有提前实施第 2 步或修改运行时代码。

验证结果：第二阶段仍保持 37 个顺序步骤，第 1 步范围基线重新 Review 通过。

## 2026-08-09：第二阶段第 2 步 Review

审查范围：启动、大厅、设置、加载、错误、游戏中、暂停、失败续玩、激励广告、结算、重开、回大厅和受控插屏的页面状态与恢复路径。

结论：

- 已新增 `SECOND_PHASE_PAGE_STATE_MATRIX.md`，覆盖第二阶段全部用户可见页面、阻断覆盖层和关键异步状态。
- 页面状态按全局运行状态与界面局部状态分层；继续沿用现有 `booting/lobby/loading-game/playing/paused/leaving-game/error`，本步骤未修改 `AppStateMachine`。
- 每个页面均明确入口、正常态、等待态、适用的空/禁用态、失败态和出口；纯本地且不存在数据集合的页面明确标记空态不适用。
- 游戏加载失败保留重试和回大厅；设置保存失败回滚；成绩保存失败不阻断导航；重开和离场失败进入可恢复错误页。
- 激励视频等待覆盖完成、跳过、失败、超时、无填充、频控和前后台异常；只有完整观看发放一次续玩，其他结果保留结算、重开和回大厅能力。
- 结算与失败覆盖层不能通过返回键消失后恢复已冻结游戏；所有阻断层遵守单层显示、输入拦截和单任务锁规则。
- 首次与后续进入均直接开局，状态清单不包含首次引导页、分步教学或引导存档。
- 已建立后续大厅、玩法、UI、广告和测试步骤到本状态清单的映射，后续无需重复定义退出与失败恢复原则。

验证结果：计划要求的页面类型全部覆盖；所有异步路径具有等待与重复操作保护；所有失败分支最终到达可操作游戏、结算或大厅；未提前制作 UI、修改玩法、广告边界或运行时代码。第二阶段第 2 步通过。

## 2026-08-09：第二阶段第 3 步 Review

审查范围：合成大西瓜水果链、生成池、投放、碰撞合成、计分、暂停、危险线、失败、续玩、结算、重开和本地纪录规则。

结论：

- 已新增 `WATERMELON_GAMEPLAY_SPEC.md`，规则可独立作为第 12～25 步的实现依据和第 32～36 步的测试依据。
- 冻结 11 级连续水果链与结果水果计分表；直接生成池仅包含等级 0～4，基线为均匀权重，等级 5～10 只能通过合成获得。
- 冻结当前/下一个水果轮换、单次输入单个投放、触摸取消不投放和基线 0.45 秒投放冷却；参数允许后续配置化调优，但不能改变规则公平性。
- 同级水果只升一级且按结果等级计分；合成必须原子锁定输入，连锁逐次计分，最高级西瓜不继续合成。
- 冻结稳定越线判负：水果上边缘越线、速度平方小于 0.25 并连续保持 1.5 秒；危险消失立即清零，失败只触发一次。
- 每个 Session 最多续玩一次；只有完整观看激励视频才移除失败冻结时越线的水果并恢复同一局，其他广告结果不发奖励且不阻断结算、重开或返回大厅。
- 最终结算只固化一次；游玩次数在新一局开始时增加，最高分和历史最大水果只在最终结算更新，中途退出和暂停重开不刷新纪录。
- 首次与后续进入均直接开始，玩法和存档均不包含首次引导状态。
- 排行榜、账号、云存档、道具、关卡、任务、货币、多次续玩和影响公平性的广告/画像规则明确排除在首发范围之外。

验证结果：规格覆盖计划要求的全部规则域；11 级水果表与当前 `FruitCatalog` 一致；生成池、计分、冷却和越线基线与现有原型一致；续玩与最终结算规则已补齐；未提前修改玩法代码、核心协议、存档或广告实现。第二阶段第 3 步通过。

## 2026-08-09：第二阶段第 4 步 Review

审查范围：首局理解度、功能闭环、单局与会话、广告结果、性能、内存、包体、异常恢复、用户反馈、问题分级和阶段放行记录。

结论：

- 已新增 `PLAYTEST_ACCEPTANCE_TEMPLATE.md`，后续开发者工具、微信真机、性能测试、用户试玩和候选回归统一复制该模板填写。
- 模板强制记录构建、设备档位、设备型号、系统、微信与基础库版本、网络、热状态、测量工具、采样区间和原始证据；缺失条件的数据只能标记“未测”。
- 功能清单覆盖冷启动、大厅目录、首次直接开局、投放、合成、计分、暂停、失败、单次续玩、广告全结果、结算、重开、返回大厅、存档、设置、安全区和快速重复点击。
- 首局理解度记录无提示首投、合成理解、下一个水果、危险线、误触和测试人员提示；比例必须同时报告分子与分母。
- 单局记录包含 Session、开始/结束原因、时长、分数、最大水果、续玩、重开和技术中断；正常时长统计明确排除技术中断局。
- 广告记录区分完成、跳过、失败、超时、无填充、不可用和频控，记录奖励次数与后续页面；非完成结果奖励必须为零。
- 性能区分平均 FPS、P5、最低值、卡顿、CPU/GPU、内存起止峰值、30 次资源压力和主包/分包体积，并要求保留原始证据。
- 异常恢复矩阵覆盖配置、Bundle、场景、存档、激励视频、插屏、重开、离场、前后台和弱网，明确是否需要重启及恢复耗时。
- 主观体验、功能结果和量化指标完全分栏；模板不预设尚无实测依据的性能阈值。
- 已定义阻塞/高/中/低问题分级和放行规则；核心操作、退出恢复、奖励准确性或死锁问题未解决时不得进入候选版本。

验证结果：计划要求的首局理解度、单局时长、重开率、广告完成/跳过/失败、帧率、内存、包体和异常恢复均有独立字段；功能、主观和量化记录分离；设备与网络条件为必填；未提前执行真机测试或填写虚构数据。第二阶段第 4 步通过。

## 2026-08-09：第二阶段第 5 步 Review

审查范围：大厅职责、页面结构、信息层级、双列网格、标准游戏卡、首发目录、设置、页脚、状态反馈、导航和数据来源边界。

结论：

- 已新增 `LOBBY_INFORMATION_ARCHITECTURE.md`，冻结大厅品牌区、双列游戏网格、设置入口、版本与必要说明的首发结构。
- 首发产品显示名称为“解压小游戏”，副标题为“随时来一局，轻松一下”；文案要求集中配置，不散落在场景和多个脚本中。
- 游戏列表固定使用两列等宽网格，按从左到右、从上到下排列；奇数尾项保留在左列，首发单卡不跨列、不居中、不放大。
- 所有卡片使用同一结构和交互权重，包含封面、名称、最多两行短说明、历史最高分和卡内进入操作，不设置轮播、主推横幅、推荐角标或卡外开始按钮。
- 普通用户首发目录只包含 `watermelon`；`blocks3d` 仅允许由开发配置或调试入口开启，实际目录配置修改仍保留到第 11 步。
- 游戏可见性继续由 Manifest/环境配置决定；大厅不得按具体游戏 ID 硬编码隐藏、排序或特殊样式。
- 大厅正常、目录加载、空目录、目录失败、进入中和返回刷新，以及卡片默认、按下、加载、禁用、封面失败和进入失败状态均有明确内容与操作。
- 历史成绩来自公共 `StorageService`，应用版本来自配置，进入游戏继续委托 `GameRuntime`；大厅不导入游戏实现或专属 Bundle。
- 设置只包含音乐、音效和振动；写入失败回滚，平台不支持振动时显示原因而非无响应。

验证结果：计划要求的全部首发信息均有唯一位置；双列、同尺寸、同层级、奇数左列和无主推规则明确；禁用与加载失败可恢复；信息来源可映射到现有 Manifest、Storage 和 Runtime 边界；未提前修改大厅场景、Prefab、Manifest 或运行代码。第二阶段第 5 步通过。

## 2026-08-09：第二阶段大厅敬请期待卡范围变更 Review

变更原因：用户要求在大厅游戏列表末尾展示一张“更多游戏，敬请期待”的空卡片。

结论：

- 敬请期待卡作为大厅自身的静态系统卡，固定追加在全部真实游戏卡之后；它不是游戏 Manifest、没有游戏 ID，也不参与可玩资格过滤。
- 该卡与标准游戏卡外部尺寸一致，但明确不可交互，不显示开始、重试或暂不可用，不触发 `GameRuntime`、Session、广告或游戏统计。
- 首发普通用户布局调整为第一行左列“合成大西瓜”、右列“更多游戏 / 敬请期待”；合成大西瓜仍是唯一可玩内容，`blocks3d` 仍不对普通用户展示。
- 当开发配置显示更多真实游戏时，敬请期待卡自动移动到真实列表末尾；合并后的卡片序列继续按行优先双列排列，奇数尾项留在左列且不跨列放大。
- 有至少一个真实游戏时才追加敬请期待卡；真实目录为空或加载失败时继续展示空态/错误态，不用占位卡掩盖异常。
- 第 5、8、11 步、页面状态清单、首发范围和测试模板已同步更新；第 5 步重新 Review 后仍满足验收条件。

验证结果：占位卡位置、尺寸、文案、不可交互语义、数据来源和 Manifest/Runtime 隔离均已明确；未提前修改大厅场景、Prefab、目录配置或运行代码。

## 2026-08-09：第二阶段第 6 步 Review

审查范围：首发视觉方向、色板、文字、布局、间距、圆角、描边、阴影、按钮、卡片、面板、图标、交互状态、Cocos 映射、素材来源、许可与 Bundle 归属。

结论：

- 已新增 `VISUAL_STYLE_GUIDE.md`，冻结“温暖果园”视觉方向：奶油暖色背景、成熟水果色点缀、柔和圆角、清晰深色文字和轻量纸片层次。
- 已定义完整色彩令牌、8 点间距体系、文字层级、圆角、描边、阴影、按钮、卡片、面板、Toast、危险线和动效时长，可直接映射到 Cocos 节点与组件。
- 基线正文色彩组合完成对比度计算；关键触摸区域不小于 88 × 88，安全区、短屏/长屏、文字截断和低档动效降级规则明确。
- 大厅、标准游戏卡、敬请期待卡、游戏 HUD、暂停、失败、续玩和结算共享同一视觉语言；合成大西瓜不设置跨列封面、主推角标或专属额外入口。
- 首发通用图标优先使用 Cocos `Graphics` 或项目自绘，不引入第三方图标包；中文文字使用平台系统字体，不向包内分发字体文件。
- 已明确 Sprite、Graphics、Label、Button、Widget、BlockInputEvents、九宫格、Shadow 节点、网格脚本和可复用 Prefab 的实现映射。
- 已新增 `ASSET_LEDGER.md`，建立状态定义、必填字段、生成素材记录模板、外部素材记录模板和候选构建检查。
- 首版台账覆盖大厅背景、品牌装饰、游戏封面、敬请期待卡、UI 九宫格、通用图标、系统字体、11 级水果、容器、粒子、公共/游戏音效和音乐。
- 每类素材均明确来源方式、许可检查、计划仓库路径和 Bundle；未生成项目全部标记为“计划中”，不得误入候选构建。
- 已冻结三类 ImageGen 提示模板，但本步骤未生成或导入正式素材；实际生成与后处理严格留到第 7、8、20 步。

验证结果：计划要求的色板、字体、圆角、描边、阴影、间距、按钮、面板、图标与状态全部覆盖；大厅和游戏令牌一致；素材类别均有来源、许可和 Bundle 路由；未提前修改场景、Prefab、玩法或广告代码。第二阶段第 6 步通过。

## 2026-08-09：第二阶段视觉独立策略变更 Review

变更原因：用户确认大厅与每个小游戏都需要单独设计，不共享一套正式视觉语言。

结论：

- 撤销“温暖果园作为大厅与游戏统一皮肤”的既有结论；大厅、合成大西瓜和未来每个小游戏分别拥有独立色板、字体气质、控件皮肤、图标、动效和声音方向。
- 仅保留安全区、最小触摸尺寸、对比度、状态完整性、异步锁、异常恢复、低档降级和素材追溯作为跨视觉单元的功能质量基线。
- `assets/shared` 仅承担行为接口、状态逻辑、无品牌技术底座和开发回退；候选版本暂停、失败、续玩和结算视觉由当前小游戏独立提供。
- 架构文档已补充视觉所有权、Bundle 隔离、迁移和回滚策略；当前不修改 Presenter、MiniGame、Session、Manifest 或存档协议。
- `VISUAL_STYLE_GUIDE.md` 已改为视觉隔离框架与方向探索，提供 5 个大厅方向和 5 个合成大西瓜方向；推荐组合为“L1 柔光收藏馆 + W1 夏日果摊纸雕”。
- `ASSET_LEDGER.md` 已按大厅和合成大西瓜两个视觉所有者重新分区，所有正式素材恢复为“方向待定”，方向确认前禁止生成和导入。
- 第二阶段第 6 步重新打开，完成计数从 6/37 调整为 5/37；第 7 步不得在方向确认前执行。

验证结果：统一皮肤不再作为有效实施依据；大厅与游戏素材路径、Bundle 和正式 UI 所有权明确分离；变更可通过现有公共视图回退且不影响运行协议。等待用户确认视觉方向。

## 2026-08-09：第二阶段第 6 步独立视觉方向确认 Review

审查范围：大厅 L1 柔光收藏馆、合成大西瓜 W1 纸片折纸果摊、独立视觉令牌、控件、动效、声音、ImageGen 提示词、素材路由和完成条件。

结论：

- 用户确认方向组合为 `L1 + W1`，并要求合成大西瓜强化纸片与折纸感。
- 新增 `LOBBY_VISUAL_SPEC.md`，冻结大厅为中性柔光收藏馆：象牙白/暖灰展陈空间、克制卡片、石墨按钮、极简线性图标和柔和展馆声音，不包含水果或折纸元素。
- 新增 `WATERMELON_VISUAL_SPEC.md`，冻结游戏为夏日纸片折纸果摊：多层彩纸、3～5 个折面、克制折痕、统一纸边和右下投影，游戏 HUD、暂停、失败、续玩、结算、图标、动效与声音全部独立。
- 11 级水果分别定义折纸识别重点；尖角、叶片和果蒂不得明显误导物理碰撞边界，场上实体与预览使用同一母版。
- 合成动效定义为纸片压扁、折叠收拢和展开为下一等级；表现不得改变合成、计分或结果时序，低档设备可移除纸屑和复杂投影。
- 两套规范分别拥有色板、字号、圆角、按钮、图标、动效、声音和 ImageGen 提示模板，不复用正式皮肤。
- 素材台账从“方向待定”更新为“计划中”，大厅资源路由到 `lobby`，游戏资源路由到 `game-watermelon`；游戏封面作为 W1 展示副本单独存于大厅 Bundle。
- 第 6 步重新满足完成条件并恢复为已完成，第二阶段进度回到 6/37；第 7 步只制作 L1 大厅素材，不提前生成 W1 游戏内资源。

验证结果：大厅与游戏两套独立规范均覆盖色板、字体、形状、材质、按钮、面板、图标、动效、声音、Cocos 映射、提示词、来源与 Bundle；旧统一视觉不再作为实施依据。第二阶段第 6 步通过。

## 2026-08-09：第二阶段音乐与音效生产责任变更 Review

变更原因：用户确认当前不提前生成音频，并要求在计划进入音乐、音效步骤时由 Codex 负责生成，不再由用户另行提供素材。

结论：

- 第 23 步调整为“原创生成并接入正式音乐、音效与振动反馈”，明确由 Codex 完成音频生产、后处理、接线和验证。
- 音频只在第 23 步生成；当前第 6 步不提前创建 WAV、压缩文件或临时音频资产。
- 大厅 L1 与游戏 W1 分别生成独立循环音乐、UI/玩法音效和声音参数，不复用音乐、音色或正式音频文件。
- 生产方式冻结为项目内可复现的程序化合成与编曲脚本，不依赖外部素材库、外部 AI 平台或用户供稿。
- 交付必须包含生成脚本、参数、随机种子、48 kHz WAV 母带、微信压缩版本、循环点、峰值/响度报告、试听记录和逐项素材台账。
- 第 23 步验收增加无缝循环、高频碰撞变体与节流、广告/暂停/前后台生命周期、Bundle 释放和用户试听确认。

## 2026-08-09：第二阶段第 7 步 Review

审查范围：L1 大厅正式背景、品牌区、安全区、常见竖屏裁切、Cocos Bundle 路由、生成追溯和初始资源预算。

结论：通过。

- 使用 Codex 内置 ImageGen 按 `L1-LOBBY-BG-V1` 原创生成 941×1672 PNG；未输入或拼接外部素材，完整提示词与修改记录已保存。
- 正式背景居中裁切并缩放为 750×1334 JPEG，质量 88、渐进编码，最终 96,594 bytes；原始 PNG 位于 `art_sources/`，不进入运行包。
- `LobbyPresentation` 从 `lobby` Bundle 加载纹理并运行时构造 `SpriteFrame`；使用等比 cover，加载失败回退为 `#F1EEE8`，不存在非等比拉伸。
- 品牌标题“解压小游戏”、副标题“随时来一局，轻松一下”由 Cocos Label 渲染；抽象馆藏标记、黄铜/鼠尾草点缀和分隔线由 Graphics 原创绘制。
- 品牌区位于既有 `SafeArea/ContentRoot`，上边距 40；背景本身无文字、按钮、水果、角色、折纸或任何小游戏主题元素。
- 750×1200、750×1334、750×1624 和 390×844 四档 cover 数学检查通过；三档裁切接触表确认标题与双列卡片区域保持低对比。
- Creator 3.8.8 已导入背景为 lobby 纹理；全量 `assets/**/*.ts` 定向类型检查通过。

验证结果：正式 JPEG 96,594 bytes；`cover_cases=4, invalid_guard=passed`；素材元数据、生成记录、Bundle 路由与失败回退齐全。第二阶段第 7 步通过，进度 7/37。

## 2026-08-09：第二阶段第 8 步 Review

审查范围：标准双列卡、合成大西瓜大厅封面、历史成绩、统一进入语义、加载/失败状态、列表尾部敬请期待卡与 Bundle 隔离。

结论：通过。

- `LobbyEntry` 将可见 Manifest 行优先排入两列，列间距 24；奇数尾项固定在左列，不跨列、不居中、不放大。
- 每个真实游戏实例化同一个 `GameCard` Prefab，由 `GameCardView` 统一呈现封面、名称、两行说明、历史最高分和“开始/加载中/重试”操作。
- 整卡只保留一个 Button 事件和一个 `EnterRequestLock` 请求；进入开始后目标卡立即禁用，失败恢复为“重试”，重复点击不会创建第二个请求。
- “更多游戏 / 敬请期待”使用同一 Prefab 与相同尺寸，但由 `bindComingSoon()` 创建静态系统卡；无 Manifest、无游戏 ID、无操作文案、Button 不可交互且不进入 `GameRuntime`。
- 使用 Codex 内置 ImageGen 原创生成 W1 大西瓜大厅展示封面；后处理为 550×320 JPEG、45,756 bytes，物理文件只位于 `lobby` Bundle。
- 封面加载由 Manifest 的大厅资源路径驱动；加载失败显示统一 L1 拱形占位但不阻断进入，不硬编码特定游戏 ID。
- Creator 资源数据库确认封面为 `cc.ImageAsset`；全部 `assets/**/*.ts` 定向类型检查通过。

验证结果：`two_column=passed, odd_tail_left=passed, empty=passed`；游戏卡与敬请期待卡首发位置为第一行左/右列；第 8 步通过，进度 8/37。

## 2026-08-09：第二阶段第 9 步 Review

审查范围：大厅设置入口、音乐/音效/振动三项、即时生效、持久化、失败回滚、平台能力与前后台一致性。

结论：通过。

- `LobbySettingsPanel` 在 L1 品牌区创建 88×88 设置入口，并在 `SafeArea/ContentRoot` 内创建带遮罩、关闭按钮和三行设置的大厅独立面板。
- 音乐与音效分别调用 `AudioService.setMusicEnabled()` / `setSoundEnabled()`，振动调用 `FeedbackService.setVibrationEnabled()`；面板不查找或修改任何小游戏节点。
- 三项设置最终统一写入版本化 `StorageService`；音乐或音效写入失败时恢复服务内存状态，面板保留“保存失败，请重试”，不会呈现错误成功态。
- `Platform.supportsVibration()` 明确区分 Web 预览与微信设备能力；不支持时振动行显示原因并禁用，不隐藏整项。
- 打开面板和前后台返回时均从 AudioService/Storage 当前值刷新；应用已有 `onHide/onShow` 音频生命周期不会重建或重置设置。
- 设置入口、面板、开关、关闭图标和错误文案全部由大厅 `lobby` Bundle 的 Label/Graphics 原创绘制，不复用 W1 游戏皮肤。

验证结果：全部 `assets/**/*.ts` 定向类型检查通过；三项调用边界、持久化和失败恢复路径均可追溯。第二阶段第 9 步通过，进度 9/37。

## 2026-08-09：第二阶段第 10 步 Review

审查范围：进入等待、重复点击、Bundle/场景/初始化超时、失败文案、诊断信息、重试、回大厅与残留清理。

结论：通过。

- 目标卡在请求开始时立即显示“加载中”并禁用；常驻 `LoadingView` 同时接管全局输入并显示“正在加载{游戏名}…”，成功或失败均在 finally 隐藏。
- `EnterRequestLock`、`GameRuntime.entering` 和 `AssetService.pendingLoads` 分别去重卡片请求、运行层请求和同 Bundle 请求，不会创建多个 Session 或重复下载。
- Asset Bundle 加载增加 15 秒超时；场景资源、场景启动和游戏初始化分别有明确超时，底层回调迟到时不会二次完成 Promise。
- 用户错误页按 bundle/scene/entry/initialize/begin/state 分类显示可行动的中文原因和稳定诊断码，不向用户暴露底层技术堆栈；完整原因仍写控制台便于诊断。
- 错误页的重试与回大厅按钮在执行期间同时禁用，并显示“重试中…”或“返回中…”；操作失败后恢复，不留下不可操作页面。
- 从错误页回大厅成功后清理失败游戏 Bundle；清理失败只记录警告，不阻断已恢复的大厅。
- 全部 `assets/**/*.ts` 定向类型检查通过。

验证结果：`bundle_timeout=32ms, concurrent_loads=1, duplicate_enter=deduped, friendly_error=passed, lobby_recovery=passed`。第二阶段第 10 步通过，进度 10/37。

验证结果：计划、两套独立视觉/声音规范和素材台账已同步；当前未生成任何音频文件，第二阶段完成计数不变。

## 2026-08-09：第二阶段第 11 步 Review

审查范围：首发游戏目录、开发游戏保留方式、Manifest 校验、旧配置迁移和标准双列排布输入。

结论：通过。

- `GameManifest.visibility` 只接受 `public` 或 `development`，字段随版本化目录一起校验；不存在按游戏 ID 隐藏卡片的分支。
- 合成大西瓜配置为 `public`，`blocks3d` 配置为 `development`；默认 `development.showDevelopmentGames=false`，普通大厅只获得合成大西瓜。
- 开发回归时显式开启配置即可同时获得合成大西瓜与 `blocks3d`，3D 样例仍保留原 Bundle、场景和入口。
- 旧版 `app.json` 缺少 `showDevelopmentGames` 时由配置归一化安全迁移为 `false`，不会意外暴露开发内容。
- 敬请期待卡仍由大厅在真实列表末尾追加，不属于 Manifest；首发输入为一个真实游戏，因此沿用标准网格自然落在左列，占位卡落在右列。
- 全部 `assets/**/*.ts` 定向类型检查通过。

验证结果：`catalog=valid, public=watermelon, development=watermelon+blocks3d, legacy_config_default=false, invalid_visibility=rejected`。第二阶段第 11 步通过，进度 11/37。

## 2026-08-09：第二阶段第 12 步 Review

审查范围：初始生成权重、投放冷却与边界、危险线参数、墙体与水果物理、分值表、Bundle 加载和非法配置处理。

结论：通过。

- 新增 `game-watermelon/configs/gameplay.json` 作为唯一运行配置入口，包含 5 级生成权重、冷却、边缘留白、稳定速度平方、连续越线时间、重力/阻尼、墙体参数、11 级半径/质量/摩擦/弹性和完整分值表。
- `WatermelonGameplayConfig` 提供同结构冻结默认值、字段范围、数组长度、全零权重和 11 级完整性校验；非法配置以带字段路径的明确错误阻止游戏初始化，不静默运行未知规则。
- `WatermelonGame` 从当前游戏 Bundle 加载 `cc.JsonAsset`，校验后才装载水果并开始；没有修改 `MiniGame`、`GameRuntime` 或公共服务协议。
- 初始水果由加权选择器生成，非法随机数安全归一为 0；直接生成数组固定只有 5 项，因此不能生成等级 5～10。
- `FruitCatalog`、`FruitBody`、投放夹取、墙体和危险判定全部消费同一份已校验配置，分值与物理数据不再散落在玩法代码中。
- Creator 资源数据库确认配置为 `cc.JsonAsset`；全部 `assets/**/*.ts` 定向类型检查通过。

验证结果：`default_config=valid, fruits=11, score_table=11, weighted_boundaries=passed, invalid_config=explicit_failure`。第二阶段第 12 步通过，进度 12/37。

## 2026-08-09：第二阶段第 13 步 Review

审查范围：候选生成权重、多局固定种子对比、初始池上限、随机公平性和确定性回归入口。

结论：通过。

- 新增可复现脚本与 `WATERMELON_BALANCE_REPORT.md`，三组候选各模拟 240 局×80 次直接生成，并明确该数据不是实际物理局时或真机体验结论。
- 入选权重为 `30/25/20/15/10`：平均直接生成等级 1.504，等级 3～4 占 25.30%，处于均匀基线 40.71% 与低级偏重 18.74% 之间。
- 相比均匀方案减少直接高阶输入，保留同级合成的成长过程；相比过度低级偏重方案减少小水果重复堆积风险，前十次仍平均出现 4.29 种水果。
- 生成配置只有等级 0～4 的五项权重，三组共 57,600 次样本均无越界生成；等级 5～10 只能由合成得到。
- 游戏生产默认使用平台随机源；测试可以在一局开始前注入固定种子源。抽取逻辑不读取分数、广告、存档或用户属性。
- 配置校验、加权边界测试和全部 `assets/**/*.ts` 定向类型检查通过。

验证结果：入选方案固定种子样本 `averageLevel=1.504, highLevelShare=25.30%, averageUniqueInFirst10=4.29, directSpawnOutsideLevel0To4=0`。第二阶段第 13 步通过，进度 13/37。

## 2026-08-09：第二阶段第 14 步 Review

审查范围：单指瞄准、取消语义、重复输入、边界夹取、小果防穿透、滚动阻尼、碰撞弹性和合成锁。

结论：通过。

- 新增 `SinglePointerDropController`：一段投放手势只归属一个触点，第二指不能抢占；只有所属触点正常结束才提交一次，触摸取消只清理手势且不投放。
- 投放冷却仍由 `DropGate` 原子消费，重复 `TOUCH_END`、快速连点和多指结束事件均不能创建第二个水果。
- 投放位置按当前半径与 8px 安全留白夹取；合成结果按新水果半径重新夹取中心点，避免大果在墙边生成时直接穿入墙体。
- 等级 0～2 小水果启用 Bullet 连续碰撞；重力调为 1.05、线性/角阻尼调为 0.18/0.30，水果弹性降至 0.04，墙体弹性降至 0.02，减少高速穿墙和持续抖动。
- 合成继续先原子锁定两个输入水果，再延迟销毁与生成；重复回调不重复合成，异级与两个最高级水果均不合成。
- Creator 已刷新新增脚本；全部 `assets/**/*.ts` 定向类型检查和配置回归通过。

验证结果：`single_pointer=passed, cancel_no_commit=passed, edge_clamp=passed, merge_lock=atomic, max_level=no_merge`。第二阶段第 14 步通过，进度 14/37。

## 2026-08-09：第二阶段第 15 步 Review

审查范围：标准分数来源、合成事件、连锁深度、首次高阶里程碑、重复结算和最高级边界。

结论：通过。

- `WatermelonRoundProgress.recordMerge()` 现在返回唯一冻结事件，明确记录结果等级、本次标准分值、累计分数、连锁深度和里程碑状态；直接投放仍为 0 分。
- 连锁深度随合成结果水果传递；后续再次参与合成时递增。每次实际合成仍只按结果水果分值加一次，不使用连锁倍率。
- 每局首次获得等级 5 以上且刷新本局最大等级时触发一次里程碑；重复获得同级不会重复触发。
- 合成锁仍先于事件创建，重复物理回调无法生成第二个计分事件；两个等级 10 西瓜没有下一等级，不能继续计分。
- 底部即时文案分别显示“合成 +分值”“连锁 ×深度 +分值”或“新水果 +分值”，并发送独立 `merge/chain/milestone` 反馈语义；正式动效与音色在第 22、23 步接入。
- 全部 `assets/**/*.ts` 定向类型检查和输入/合成回归通过。

验证结果：`score_sources=3+6+21+21+66, chain_no_multiplier=passed, milestone_once=passed, top_level=10`。第二阶段第 15 步通过，进度 15/37。

## 2026-08-09：第二阶段第 16 步 Review

审查范围：稳定越线、计时清零、危险提示、单次结束锁、输入冻结、物理冻结和待执行合成。

结论：通过。

- `OverflowGuard` 独立为纯规则模块，只在稳定越线为真时累计；任意一帧恢复安全立即清零，达到配置的 1.5 秒后只返回一次完成。
- 首次进入连续危险状态发送 `danger` 反馈；警戒线显示剩余时间，恢复安全后回到常态，失败时固定为明确红色越线状态。
- 稳定速度阈值继续使用物理单位平方 0.25；下落经过、合成锁定中的水果和短暂越线均不触发最终失败。
- `gameEnding` 在固化结果前原子置位，随即禁用投放、清理指针、取消所有回调、隐藏预览并禁用场上水果刚体。
- 碰撞入口与延迟合成回调都检查 `playing && !gameEnding`；失败快照之后不能再生成水果、合成或上报分数。
- 全部 `assets/**/*.ts` 定向类型检查及计分回归通过。

验证结果：`transient_overflow=reset, stable_1.5s=single_finish, negative_delta=ignored`。第二阶段第 16 步通过，进度 16/37。

## 2026-08-09：第二阶段第 17 步 Review

审查范围：单局一次续玩、广告完成条件、重复请求/回调、越线水果移除、恢复等待和非广告出口。

结论：通过。

- `SingleContinueRule` 明确 `available → requesting → used/closed`；只有 `completed` 返回续玩，同一局第二次请求和重复广告回调均为忽略。
- 首次失败在 W1 游戏层显示续玩冻结面板，提供“看视频续玩”和“直接结算”；广告请求期间两个按钮同时禁用，避免并发请求或同时结算。
- 完整观看后按失败判定同一半径规则移除所有上边缘越线水果；异常情况下至少移除最高水果，移除不计分、不扣分、不触发合成。
- 恢复时重置危险计时、解除被取消合成的物理锁、恢复剩余水果物理，并等待配置的 0.6 秒稳定期后才重新开放投放。
- 跳过、失败、异常、服务缺失或主动放弃均直接固化同一失败快照；不会奖励续玩，也不会阻断结算、重开或回大厅。
- 续玩后规则状态保持 `used`，第二次失败直接结算；重开创建新规则实例并恢复一次机会。
- 全部 `assets/**/*.ts` 定向类型检查及核心玩法配置回归通过。

验证结果：`completed=continue_once, duplicate_callback=ignored, skipped=settle, failed=settle, decline=settle_without_ad`。第二阶段第 17 步通过，进度 17/37。

## 2026-08-09：第二阶段第 18 步 Review

审查范围：游戏内数据版本、旧档迁移、游玩次数、最高分、历史最大水果、续玩统计、写入时点与失败处理。

结论：通过。

- 合成大西瓜游戏存档升级为 `dataVersion: 2`；已知自定义字段为 `maxFruitLevel`、`continueOfferCount` 和 `continueCompletedCount`。
- v1 或缺字段旧档在游戏命名空间内补齐非负默认值，保留未知自定义字段和原最高分；公共根存档仍为 schema 2，无需破坏性全局迁移。
- 每次新一局开始只增加 `playCount` 并更新 `lastPlayedAt`；续玩不增加局数。
- 只有最终结算更新 `highScore`、历史最大水果与本局续玩统计；中途退出和暂停重开不会调用最终纪录写入。
- 写失败在游戏内记录诊断但不重复结算，也不阻断结果页、重开或回大厅；结果持久化锁在尝试写入前设置。
- 存档中不存在引导、教程或首次进入字段；架构文档已记录迁移和安全回滚方式。
- 全部 `assets/**/*.ts` 定向类型检查及续玩状态回归通过。

验证结果：`v1_to_v2=passed, play_start_only_increments_count, final_updates_record, continue_stats=2/1, tutorial_state=absent`。第二阶段第 18 步通过，进度 18/37。

## 2026-08-09：第二阶段第 19 步 Review

审查范围：当前分数、最高分、下一水果、暂停入口、危险线、W1 视觉隔离、安全区和玩法容器稳定性。

结论：通过。

- HUD 改为 W1 纸片果摊专属布局：奶油纸、阳光黄和浅薄荷三张不同折角纸签分别承载当前分数、历史/本局最高分和下一个水果，不使用大厅 L1 卡片。
- 历史最高分从本局开始存档读入，HUD 显示历史值与当前分数较大者；分数显示和运行层上报继续来自同一 `WatermelonRoundProgress.snapshot`。
- 暂停入口改为 96×96 珊瑚纸片，使用两条深棕纸条图标；触摸面积超过 88×88 基线，按下使用缩放反馈。
- 安全区上/下边距只影响标题、HUD 与底部提示；容器宽度保持最多 650，长屏容器高度封顶 800，750 宽常见短屏为 789，与标准高度偏差约 1.4%。
- 危险线始终位于容器顶边下 145，碰撞半径与危险判定不因 HUD 安全区移动而改变；玩法区与 HUD、底部提示均保持间隔。
- 750×1200、750×1334、750×1624 和最小回退 600×1100 四组数学布局通过；全部 `assets/**/*.ts` 定向类型检查通过。

验证结果：`layouts=4, safe_insets=passed, board_hud_separation=passed, danger_rule_invariant=passed, pause_touch=96x96`。第二阶段第 19 步通过，进度 19/37。

## 2026-08-09：第二阶段第 20 步 Review

审查范围：11 级正式水果、W1 游戏背景、容器/边界、碰撞视觉一致性、Bundle 路由、来源追溯与生成服务偏差。

结论：通过（记录 ImageGen 服务降级）。

- 按冻结 `W1-FRUIT-SET-V1` / `W1-GAME-BG-V1` 提示调用 ImageGen 三次，均因生成服务网络层错误而未产出；没有把失败请求或伪造结果记为 ImageGen 素材。
- 启用项目内可复现原创回退：SVG 几何定义 11 个水果轮廓、折面、折痕、纸纤维、统一光向和投影，经 Sharp 确定性导出，不读取或拼接外部素材。
- 11 级均为 512×512 透明 PNG；48px 分析得到 11 个不同色彩签名，目视接触表确认轮廓/主色/纹理可以区分，柑橘通过顶凸与叶片、尺寸和色面区分。
- 场上实体、当前预览和下一预览共同消费 `FruitCatalog.sprite` 指向的同一 SpriteFrame；11 条资源路由全部存在。
- Sprite 最大装饰范围为碰撞直径 1.04 倍，用于纸叶/果梗；主体半径仍由同一玩法配置驱动 Collider、墙边夹取与危险线判定。
- 背景为 750×1334 低对比纸艺果摊并等比 cover；容器、12px 牛皮纸边界和危险带由 W1 Graphics 绘制，实际墙体位置与视觉边界共用布局尺寸。
- 全部资源位于 `game-watermelon`，Creator 已生成 11 个水果 Meta 并抽查为 `cc.ImageAsset`；全部 `assets/**/*.ts` 定向类型检查通过。

验证结果：`fruits=11, dimensions=512x512, alpha=passed, color_signatures=11, fruit_bytes=1143177, background=750x1334/29243B`；`sprite_routes=11`。第二阶段第 20 步通过，进度 20/37。

## 2026-08-09：第二阶段第 21 步 Review

审查范围：首次/后续进入路径、首个投放、瞄准表达、投放/合成/危险反馈和引导状态排除。

结论：通过。

- `begin()` 对首次和后续进入执行完全相同的 `playing → resetRound → recordPlayStart`，不检查首次进入标记，也不等待确认弹层。
- 新局在准备好当前/下一个水果后立即开放 `DropGate`；玩家第一次触摸即可移动预览，正常松手即可投放。
- W1 虚线投放轨迹随当前水果横向移动并标出落点方向；投放冷却和失败冻结时隐藏，恢复可投放时同步重现。
- HUD 常驻“拖动纸片，松手投放”和“左右移动，松手投放”短文案；预览与场上实体同源，投放、同级合成、加分/连锁和危险倒计时均有即时反馈。
- 触摸取消仍不投放，多指/重复结束仍只产生一次；直接开局没有放宽输入安全规则。
- 游戏存档和开始路径均不存在 guide/tutorial/onboarding/first-play 字段或分支；全部 `assets/**/*.ts` 定向类型检查通过。

验证结果：`begin=direct_playing, first_drop=enabled, aim_guide=present, instant_feedback=merge+danger, tutorial_state=absent`。第二阶段第 21 步通过，进度 21/37。

## 2026-08-09：第二阶段第 22 步 Review

审查范围：投放、碰撞、合成揭示、连锁纸屑、分数飘字、物理/计分时序、设备降级和生命周期清理。

结论：通过。

- 投放使用 140ms 纸片展开缩放；碰撞使用 80ms 轻压回弹；合成结果使用 260～310ms 先压扁、再展开的折纸揭示。
- 三类 Tween 只作用于 `PaperFruitVisual` Sprite 子节点，不修改水果刚体节点的位置、碰撞器、速度或合成资格。
- 原子合成、结果水果生成和 `recordMerge` 计分先完成，再启动揭示、飘字和纸折片；动画不会延迟或重复玩法结算。
- 每次合成创建一次 `+分值` 飘字，连锁带深度；高/中档分别生成 8/4 个三角纸片，低档粒子数为 0 但保留缩放与分数反馈。
- 暂停、失败冻结、重开和退出四条路径都清理临时节点并停止 Tween；水果销毁时也停止其视觉 Tween，不遗留材质、粒子或回调。
- 动效节点全部由 `game-watermelon` 内 Graphics/Label 创建，不引用大厅皮肤或外部纹理；全部 `assets/**/*.ts` 定向类型检查和计分回归通过。

验证结果：`drop+collision+merge=visual_only, scoring_before_fx=passed, low_particles=0, cleanup_paths=4`。第二阶段第 22 步通过，进度 22/37。

## 2026-08-09：第二阶段第 23 步工程 Review（待用户试听）

审查范围：原创生成、L1/W1 声音隔离、WAV 母带、MP3 运行文件、响度/峰值/循环、Cue 接线、碰撞节流、振动与生命周期。

结论：工程验收通过；按计划验收条件等待用户试听确认，因此第 23 步暂不勾选。

- 固定种子脚本生成 17 个 48 kHz 双声道 WAV 母带和 17 个 MP3；不使用任何外部音乐、采样或素材库。
- L1 与 W1 的音乐、音色、文件名、目录和 Cue 完全分离；运行文件总计 731,232 bytes。
- 两首母带循环边界采样差为 0，所有峰值不高于 -2 dBFS；完整逐项指标写入 JSON 报告。
- `BundleAudioBank` 负责加载、注册、停止和解除引用；设置、后台、游戏暂停、广告、续玩、重开、退出和 Bundle 生命周期均有明确路径。
- 3 个碰撞变体按序轮换，80ms 节流；高频碰撞不会叠加为连续爆音。
- `lamejs` 为未修改的 LGPL-3.0 开发工具，许可与致谢已登记；编码器不进入游戏 Bundle，输出声音保持项目原创。
- Creator 抽查运行文件均为 `cc.AudioClip`；全部 `assets/**/*.ts` 定向类型检查通过。

验证结果：`assets=17, wav=RIFF/48kHz, mp3=valid, music_seams=0, peaks<=-2dBFS, bundle_routes=isolated`；等待用户试听 L1/W1 方向后关闭本步。

## 2026-08-09：第二阶段第 24 步 Review

审查范围：W1 自有暂停页、续玩/失败页、结果页、公共运行层回退、按钮四态、快速连点、直接重开/回大厅、结果字段与协议兼容。

结论：通过。

- `MiniGame` 新增可选暂停/结果 Presenter；W1 在 `game-watermelon` Bundle 内绘制纸片面板，未复用 L1 大厅皮肤；未实现新接口的游戏仍使用公共暂停/结果视图。
- 暂停页提供继续、重新开始和回到大厅；结果页展示最终分数、本局最大水果等级与新纪录，提供再来一局和回到大厅。
- 失败页提供看视频续玩、查看本局结算、再来一局和回到大厅；直接重开/回大厅仍先固化同一失败快照和存档，再把去向交回运行层。
- `terminalActionPending`、续玩状态机和 Presenter `busy` 锁分别拦截失败页、广告与暂停/结果页的快速重复操作；异步期间全部按钮不可交互并呈现等待状态，按压使用缩放反馈。
- 协议扩展为可选、增量兼容；架构文档已记录迁移与回滚，Manifest、Session 与存档结构不变。
- 全部 `assets/**/*.ts` 定向类型检查、原运行时加载/错误回归、续玩状态机与存档迁移回归通过。

验证结果：`w1_presenters=pause+result, shared_fallback=preserved, failure_actions=continue+result+restart+lobby, rapid_click=deduped, button_states=default+pressed+disabled+waiting, migration=additive`。第二阶段第 24 步通过；已完成总数 23/37，第 23 步仍待用户试听。

## 2026-08-09：第二阶段第 25 步 Review

审查范围：短屏、标准刘海屏、长屏挖孔、深刘海、窄屏回退、1～4 倍像素密度、安全区、触控尺寸、文本溢出与玩法几何一致性。

结论：通过。

- 新增纯设计坐标适配规则，暂停、续玩/失败和结果面板按画布与上下安全区计算宽度、高度和纵向中心；像素密度只影响采样，不改变触摸尺寸与玩法参数。
- 覆盖 750×1200、750×1334、750×1624（两组安全区）和 600×1100；所有纸片面板及四个失败页按钮均位于安全区内，窄屏面板保留 48 设计像素横向留白。
- 暂停按钮保持 96×96；弹层关键按钮统一为 88 设计像素高，按压、禁用与等待状态不因适配缩放失效。
- HUD、失败页和暂停/结果页文本统一启用 `SHRINK` 溢出策略；多设备接触表目视确认标题、操作区与底部提示无裁切。
- 玩法容器宽度继续封顶 650、高度封顶 800；危险线始终位于容器顶部下方 145，安全区变化不会改变越线判定或可投放范围。
- Cocos 资源库刷新后确认 `WatermelonResponsiveRules.ts` 与 `WatermelonOverlayView.ts` 均为 `cc.Script`；第 10～25 步全部自动回归、美术/音频资源验证和定向 TypeScript 检查通过。

验证结果：`devices=5, density_matrix=1x+2x+3x+4x, safe_panels=passed, touch_targets>=88, text_shrink=enabled, gameplay_geometry=invariant`；目视文件 `temp/step25-responsive-contact.png`。第二阶段第 25 步通过；已完成总数 24/37，第 23 步仍待用户试听。

## 2026-08-09：第二阶段第 23 步音频 V2 试听迭代

用户反馈：L1 大厅循环在现有基础上再丰富；W1 危险提示不够危险；W1 失败音效不采用 V1 风格。

处理状态：V2 工程完成，等待用户复听。

- L1 保留原 32 秒柔光和弦与主旋律，新增 8 小节温暖低频托底、左右回应旋律和稀疏空间闪光；仍为零采样缝循环。
- W1 危险由 0.72 秒单一低频提示重制为 1.05 秒四段警报脉冲、交替上扬扫频和紧迫底层，四个时间窗均通过有效能量检查。
- W1 失败由 0.95 秒低沉合成器方案完全重制为 1.2 秒三次纸片散落、三段下行音高和克制低频尾声；生成块不再使用旧三角波失败方案。
- 生成器支持通过 `AUDIO_ASSET_FILTER` 仅重建指定资产，避免覆盖编辑器或播放器正在占用的无关母带；报告会合并保留未修改资产并按正式清单排序。
- 三项 WAV/MP3、48 kHz、峰值、循环、路由、Cue 生命周期和碰撞节流验证通过；Creator 刷新后均确认为 `cc.AudioClip`，UUID 与原运行路径保持不变。

验证结果：`revision=2, lobby_layers=8bars+stereo_detail, danger_pulses=4, failure_direction=paper_fall+descending_tail, sample_rate=48kHz`；总音频验证 `assets=17, music_seams=0, peaks<=-2dBFS, runtime_bytes=735840`。第 23 步继续保持未勾选，等待用户复听确认。

## 2026-08-09：大厅 → 合成大西瓜整体返修 Review

审查范围：大厅信息层次、品牌区、真实/期待卡片、W1 封面一致性、场景卸载、11 级水果导入类型、运行时 SpriteFrame、预览/实体尺寸、直接进入与首个投放。

结论：通过；第二阶段步骤计数不变，本次属于第 7～8、19～21 步的缺陷修复和质量加固，第 23 步仍等待音频 V2 试听。

- 根因一：11 张水果 PNG 在 Cocos 中只有 `texture` 子资源，旧代码却请求 `/spriteFrame`；`Promise.all` 中任一路径失败都会中断 `WatermelonGame.initialize()`。`FruitCatalog` 已统一改为 `/texture`，游戏按 `Texture2D` 加载后创建自有 `SpriteFrame`，退出和初始化失败时销毁。
- 根因二：大厅切场景时旧节点可能先失效，`LobbyPresentation.unmount()` 随后对无效节点调用 `getComponent()`。卸载逻辑现先检查 `isValid`，因此进入 W1 不再在场景切换阶段抛错。
- 根因三：给运行时帧赋值会把 Sprite 恢复到 512px 原图尺寸；预览与物理水果已统一为“先设 `CUSTOM`、再赋帧、最后重申目录尺寸”，消除巨型水果。
- 大厅改为独立 L1 游戏展厅：新增暖色收藏牌、馆藏编号、氛围光斑和展墙细节；卡片改为有明确底板、侧脊、阴影、类型展签、档案折角和按钮四态的展品档案卡。
- “更多游戏”卡保持标准卡尺寸和右列尾项位置，使用鼠尾草空展位、叠放卡和加号；不进入 Manifest、不显示进入按钮、不可点击。
- W1 封面替换为 920×690 程序化折纸构图，直接复用项目自有水果母版的 7 种水果；当前封面、预览、实体因此保持同一纸片折面语言。
- 游戏内舞台增加标题纸牌、W1 版本签、三张 HUD 纸签、纸箱阴影/内框/折角和底部操作纸条；大厅视觉文件仍只在 `lobby`，W1 游戏资源仍只在 `game-watermelon`。
- Cocos 实际浏览器预览（Apple iPhone 12/13 preset）完成闭环：大厅正常渲染 → 点击卡片进入 W1 → 预览水果正常尺寸 → 点击投放 → 物理水果落下；无错误遮罩，FPS 面板显示运行中 60 帧目标（仅作该次预览观察，不作为真机性能结论）。
- 全部定向 TypeScript 检查和第 10～25 步测试通过；新增回归同时校验 11 张 PNG Meta 的 Texture2D 子资源、运行时帧所有权、CUSTOM 尺寸顺序、尾卡顺序、V2 封面和 L1/W1 视觉节点。

验证结果：`entry_assets=Texture2D+owned_SpriteFrame, fruits=11, background=Texture2D, tail_card=last, lobby_gallery=rich, cover=origami_v2, w1_stage=paper`；运行预览 `lobby → W1 → first_drop=passed`。

历史修正：第 20 步原 Review 的“`FruitCatalog.sprite` 指向 SpriteFrame”与“`sprite_routes=11`”只验证了文件字符串，没有验证 Cocos 子资源类型，现以本次 Texture2D Meta 与实际预览证据替代。

## 2026-08-09：大厅与 W1 缺陷修正、音频 V3 Review

用户反馈：水果碰撞过吵；W1 循环音乐单调且偏重；每次放下水果都会触发警戒；大西瓜缺少圆形边框；标题与分数重合；回大厅报错；大厅设置入口/弹窗过素；真实游戏卡的进入按钮遮挡内容。

结论：代码、资源与真实预览验收通过；第 23 步继续保持未勾选，仅等待用户对音频 V3 的复听确认。

- 警戒误报根因是新水果出生在警戒线上方且初速度接近零，被“稳定溢出”规则立即计入。`FruitBody` 现记录 0.7 秒出生宽限与是否进入过安全区；水果进入安全区后恢复正常判定，真正堆高仍会触发 1.5 秒倒计时。
- 返回大厅错误根因是运行时 `SpriteFrame` 在旧场景最后一帧仍提交绘制时被同步销毁。退出流程现先清除所有自有帧绑定、把水果从渲染树移除，并在 `Director.EVENT_AFTER_DRAW` 后销毁帧。
- 标题纸牌整体上移并压缩到独立标题区，分数/最高/下一个三张 HUD 票卡保留在下一行；Apple iPhone 14 Pro 预览无重叠。
- 10 级大西瓜源 PNG 增加 18px 深色圆形外框；实体与“下一个”预览另绘深色外圈和浅色内圈，避免缩放或裁切时边界丢失。
- 标准游戏卡取消独立“进入游戏”按钮，整卡继续作为唯一入口；加载、失败、禁用状态改由成绩行承载，不再遮挡说明和成绩。
- 设置入口改为带阴影、侧脊和折角的黄色展签；弹窗改为奶油纸张、珊瑚背纸、薄荷标题带与三张独立设置票卡，开关拥有轨道、旋钮、阴影和明确的开/关位置。
- 音频 V3 将 W1 循环扩展到 32 秒，加入双循环和声、轻量低音、交替回应与稀疏闪光，目标近似 -23 LUFS；三组碰撞缩短到 0.10 / 0.11 / 0.12 秒并降到近似 -24 LUFS、峰值低于 -8 dBFS。
- Cocos 浏览器预览完成“大厅设置 → 整卡进入 W1 → 首次投放 → 等待落地 → 暂停 → 回大厅”闭环；警戒线在投放后保持正常文案，返回大厅成功，预览重载后的本轮新增错误数为 0。

验证结果：定向 TypeScript 编译通过，`ALL_TESTS_PASSED=17`；`danger=spawn_grace+safe_zone, disposal=after_draw, watermelon=explicit_ring, hud=separated, card=no_cta, settings=gallery_ticket_system`；音频 `revision=3, game_music=32s+lighter_layers, collisions=short+soft`。步骤计数仍为 24/37。

## 2026-08-09：W1 全水果圆框、下落手感与大厅设置细化 Review

用户反馈：要求全部水果都有清晰圆形边框；标题与分数间距继续加大；松手音效难听；水果下落过慢；设置按钮偏大且弹窗左侧两条竖线重合。

结论：通过；本轮属于视觉、音频与物理手感缺陷修正，第二阶段步骤计数保持 24/37，第 23 步等待音频 V4 试听确认。

- `FruitBody` 与 `drawFruitPreview()` 不再只为 10 级西瓜绘制圆环；全部 11 级场上实体、当前投放预览和“下一个”预览统一叠加深棕外圈与浅奶油内圈，圆环半径与碰撞圆一致。
- `scoreY` 从标题基准下方 94 调整为 116 设计像素；标题纸牌和 82px 高 HUD 票卡之间形成约 23 设计像素留白，短屏布局仍满足棋盘与底部说明边界。
- 运行配置与 TypeScript 默认配置的 `gravityScale` 同步从 1.05 提升到 1.6；iPhone 14 Pro 预览中水果投放约 0.8 秒已落过警戒线，节奏明显加快，Bullet/阻尼/弹性和危险判定保持不变。
- 投放松手 Cue V4 移除 92 Hz 低频三角波，改为 0.15 秒轻纸面滑动、下行正弦与克制高频尾声；目标近似 -22 LUFS、峰值 -11.19 dBFS，原 Cue 路由和 Bundle 归属不变。
- 大厅设置入口可视底板从 76 缩到 60 设计像素，保留 88px 触控区；齿轮、折角、侧脊和阴影同步缩放。
- 弹窗珊瑚背纸从向左错位改为向右/向下错位，左侧仅保留一条 10px 珊瑚侧脊，不再出现双竖线叠加。
- Cocos 浏览器预览完成大厅、设置弹窗、W1 首屏、投放中和落地状态检查；普通水果、当前预览和下一个预览圆框均清晰，标题/HUD 有明显留白，设置面板单侧脊，本轮控制台错误为 0。

验证结果：`fruit_outlines=all_levels, hud_gap=23px, gravity=1.6, settings=single_spine+smaller_entry`；音频 `revision=4, drop=short+paper_flick`；全部音频 `assets=17, music_seams=0, runtime_bytes=830400`。

## 2026-08-12：猫咪返修与第二阶段 2048 范围变更 Review

用户要求：第九只猫不得使用无毛猫；缩小猫咪游戏失败弹窗按钮并增加类似暂停弹窗的间隔；在正式广告接入前先完成一款具有独立视觉和音效的 2048 游戏。

范围决定：通过，先更新计划再实施。

- 第九级猫保持 `silver-tabby` 资源 ID、Meta UUID 和存档等级不变，只恢复为有毛银渐层；失败弹窗按钮改用与暂停层一致的 400×66 视觉尺寸和 16 圆角，保留原有安全区面板与动作去重。
- 第二阶段首发正式游戏由一款增加为两款；“霓光 2048”作为独立 `game-2048` Bundle 和第二张标准游戏卡，“更多游戏”占位卡顺延到第二行左列。
- `SECOND_PHASE_SCOPE.md`、`SECOND_PHASE_PAGE_STATE_MATRIX.md` 和 `CONTENT_PRODUCTION_PLAN.md` 已先行更新；2048 制作列为第 26～32 步，原广告步骤顺延到第 33～38 步，候选版本验收顺延到第 39～44 步。
- 2048 采用深色霓光数字棋盘与电子音色，独立于猫咪游戏的暖色纸片猫屋；公共运行层、Manifest、存档命名空间和退出/重开协议保持不变。
- 迁移不修改根存档 schema；新增游戏只创建独立游戏命名空间。回滚时可从公开目录移除 2048 Manifest 并删除 `game-2048` Bundle，不影响猫咪游戏存档。

## 2026-08-12：猫咪返修与霓光 2048 完成 Review

审查范围：第九只猫、失败弹窗按钮、2048 规则模型、独立 Bundle、场景、Manifest、大厅入口、触控/键盘输入、撤销、动效、音频、存档、暂停/目标/结果闭环、Creator 编译与浏览器试玩。

结论：猫咪返修通过；第二阶段第 26～32 步通过，已完成总数更新为 31/44；下一步从第 33 步开始正式广告接入。

- 第九级目录和三张运行帧恢复为有毛银渐层，保留 `silver-tabby` ID、Meta UUID、等级和存档兼容性；源图目视确认耳朵、面部、身体和尾巴均有完整毛发。
- 猫咪失败/续玩弹窗四个按钮改为最大 400×66、16 圆角，原 89 设计像素纵向节距保留，因此按钮间形成 23 设计像素留白，与暂停弹窗的密度一致。
- 新增 `game-2048` 独立 Bundle、`Game2048` 场景、`Game2048Game` 入口和公开 Manifest；大厅展示第二张同规格卡，敬请期待卡顺延到第二行左列。
- 规则模型实现四向压缩与单次合并、有效移动后 90%/10% 生成 2/4、计分、单步撤销、首次 2048 目标和无步可走；8 个确定性样例覆盖左右上下、无效移动、撤销、目标与失败。
- 2048 使用深靛电路背景、青绿/琥珀数字块、电子面板弹层和独立大厅封面；游戏画布增加 32 设计像素出血，Creator iPhone 14 Pro 预览无白边，与暖色纸片猫屋视觉完全分离。
- 原创 T48 音频包含 24 秒无缝电子循环和按钮、移动、无效移动、生成、合并、连锁、目标、失败、新纪录 9 个 Cue；10 个 MP3 全部位于 `game-2048` Bundle，不复用 L1/W1 文件名或路由。
- 存档使用独立 `game2048` / `dataVersion: 1` 命名空间，记录游戏次数、最高分和 `custom.highestTile`；浏览器退出后再次进入，最高分 4 正常恢复。
- Creator 资源库成功刷新并生成包含 `Game2048Game` 与最新画布出血修正的 preview chunk；浏览器实际完成“大厅 → 2048 → 触控滑动 → 键盘合并 → 撤销 → 暂停 → 恢复 → 返回大厅 → 再次进入”闭环。
- 定向 TypeScript 编译、项目资源/Manifest/场景检查和全量音频检查通过。完整发布包仍按第 41、43 步在目标 Web/微信发布环境生成；当前桌面会话中另启的隔离 CLI 构建因 Creator 要求 GUI 构建上下文而未产生产物，相关子进程和临时副本已清理，未关闭或修改现有编辑器实例。

验证结果：`game2048_model=passed, cases=8, directions=left+right+up+down, invalid_move=passed, undo=passed, target=passed, gameover=passed`；`game2048_project=passed, manifest=public, audio=10, cover=present`；音频 `assets=27, music_seams=0, peaks<=-2dBFS, runtime_bytes=1159680`；Creator 浏览器闭环通过。

## 2026-08-13：第九只猫与物理尺寸纠偏 Review

用户纠偏：第九只猫必须是不同于旧银渐层和其余 10 只的新形象；此前 `CAT_VISUAL_SCALE = 1.12` 只放大 Sprite，不符合“猫咪物理大小和碰撞体一起变大”的要求。本条取代 2026-08-12 Review 中“恢复银渐层”和“只增加视觉尺寸”的结论。

- 第 9 级改为全新“蓝灰折耳”：纯蓝灰浓密短绒、明显折耳、铜金眼和炭黑鼻；与旧银渐层的竖耳条纹、现有灰虎斑和其他高阶猫均有不同的耳型、毛色与面部识别组合。
- 使用内置 ImageGen 分别生成睁眼待机、闭眼待机和惊讶下落三帧；生成源、最终提示词和确定性后处理脚本已入库。运行帧为 256² RGBA、252px 圆形 Alpha，三帧 Alpha 完全一致。
- 旧 `cat-08-silver-tabby` 三帧及 Meta 已移出运行 Bundle 并归档；目录继续保留 33 张实际加载帧，不增加无用纹理包体。
- 删除 `CAT_VISUAL_SCALE`。11 级物理半径从 `[24…158]` 统一乘以 1.12 为 `[26.88…176.96]`；节点尺寸、Sprite 可见圆、`CircleCollider2D.radius`、投放夹取、出生位置和危险判定均使用同一个新半径。
- 保持原质量参数，因此物理尺寸变大但重量阶梯不变；碰撞密度按新圆面积自动重算，避免视觉越出碰撞体。
