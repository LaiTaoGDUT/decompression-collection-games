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
