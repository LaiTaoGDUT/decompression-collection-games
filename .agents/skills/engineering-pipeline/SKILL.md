---
name: engineering-pipeline
description: 通用分层工程工作流：按任务复杂度选择直接实现或 Grilling 需求冻结，再经过只读 Preflight、唯一 Builder、项目原生检查、独立 Reviewer 和条件式 Sol 咨询。用于复杂改动、跨文件实现、缺陷修复、架构/数据/安全风险、用户要求先讨论或独立审核的工程任务；简单明确的单点修改可以跳过完整流水线。
---

# Engineering Pipeline

## 目标与边界

把自然语言请求变成可验证的工程交付，同时保留用户的最终决策权。

- 保存 `ORIGINAL_USER_REQUEST`；任何 Agent 的结论都是证据或建议，不得覆盖原始请求。
- 只允许 `builder_luna` 修改工作区；`preflight_luna`、`reviewer_luna`、`sol_consultant` 只读。
- 不假设项目使用某个语言、框架、目录、包管理器或测试命令；项目信息只通过运行时发现接入。
- 默认不提交、不推送、不发布；只有用户明确授权时才做这些外部状态变更。
- 默认角色档位由 Agent 配置提供：Builder、Preflight、Reviewer 使用 Luna-max，Sol 使用 Sol-High。模型可通过 Agent 配置替换，流程不依赖具体模型名。

## 子 Agent 等待、超时与中断策略（强制门禁）

本节是流程门禁而非建议。主 Agent MUST 严格执行以下规则；任何未明确列出的情形都不得推定为例外。

- 子 Agent 在读取、编译、测试、构建等长任务中没有中间输出，不等于卡住；静默、没有新文件、等待时间变长、等待工具返回 `timed_out`，以及主 Agent 想向用户汇报进度，都不是失去响应的证据。只要子 Agent 处于 `pending_init` 或 `running`，主 Agent 就不得因上述任何理由发送进度催问、调用 `interrupt` 或调用 `close_agent`。
- 子 Agent 启动后，主 Agent MUST 优先调用 `wait_agent` 等待；除非工具提前返回最终状态，默认每次等待窗口不得少于 `300000ms`。禁止用短窗口高频轮询、反复探测或用催问制造状态更新。
- `wait_agent` 返回 `timed_out` 不是子 Agent 的终态。超时后，主 Agent 只能继续对同一 Agent 调用等待；或者仅在确有必须转交的新任务信息时，用 `interrupt=false` 排队发送。不得据此关闭、重启或重新 spawn 该 Agent。
- 在子 Agent 处于 `pending_init` 或 `running` 期间，主 Agent 不得发送“是否卡住”“请汇报进度”“还要多久”等消息。只有子 Agent 明确请求输入，或用户提供了必须转交的新指令时，才可排队发送，且 MUST 使用 `interrupt=false`，不得使用 `interrupt=true`。
- `interrupt=true` 只允许用于以下情形：用户明确取消或改派任务；出现明确且可核验的安全、数据损坏、重复写入或工作区破坏风险；平台明确报告不可恢复错误。每次使用都 MUST 记录可核验事实；任何时间阈值、等待时长或静默本身都不得替代证据。
- `close_agent` 只允许用于子 Agent 已返回 `completed`、`errored`、`shutdown` 等终态；用户明确取消；或已明确确认不再需要且子 Agent 不在执行中。禁止关闭 `pending_init` 或 `running` Agent；禁止把 `timed_out` 当作关闭条件。
- 禁止为替代仍在运行的 Agent 启动重复 Agent。若误关闭且任务未被取消，主 Agent MUST 优先调用 `resume_agent`，不得直接重复 spawn。
- 进度更新 MUST 发给用户，不得通过打扰子 Agent 来制造进度。违反本节门禁视为协调错误；主 Agent MUST 恢复等待并报告事实，不得自行放宽或事后改写规则。
- 这些规则不改变 Builder 唯一写入者、Preflight/Reviewer/Sol 只读、最多两轮修复循环以及用户原始请求优先级等既有规则。

## 路由

先记录工作区基线（如可用，读取 `git status` 和相关 diff），保留已有改动，不清理、不重置、不覆盖用户文件。

### TRIVIAL

确定性文案、格式、单点配置或明显局部修改：

1. 可跳过 Grilling 和 Preflight。
2. 由 `builder_luna` 完成最小修改。
3. 运行相关的项目原生检查、`git diff --check`（若可用）并交付。

### NORMAL

涉及多个文件、行为逻辑、未知代码路径或需要取舍：

1. 按下方规则判断是否进入 Grilling。
2. 启动 `preflight_luna`，得到 `ENGINEERING_BRIEF`。
3. 启动 `builder_luna`，输入原始请求、决策记录和工程简报。
4. 执行 Direct Check，再启动 `reviewer_luna`。

### RISKY

认证、权限、安全、公共 API、数据迁移、持久化、并发、资金/隐私、架构边界或不可逆操作：

执行 NORMAL 流程，并要求明确的验收和回滚条件。只有触发升级条件时才启动 `sol_consultant`。

## Grilling 需求冻结

以下任一条件成立时进入 Grilling：

- 用户明确要求先讨论、规划、质询或压力测试。
- 需求存在多个合理方案、关键取舍或验收标准不清楚。
- 任务属于新功能、跨模块变更、架构/数据/安全/发布风险。
- 用户的请求可能导致较大范围修改，且边界尚未确认。

如果当前上下文已经提供 `grilling` Skill，优先使用它；不要复制、修改或安装项目内的 Grilling。若它不可用，执行下面的内置简化设计门：

1. 读取环境事实；不要向用户询问可以从仓库、工具或现有上下文查到的事实。
2. 把未决判断整理成设计树，只询问当前 frontier 上的问题。
3. 每轮一次性询问全部当前问题，并为每题给出推荐答案。
4. 等待用户回答；根据回答重新计算下一轮 frontier。
5. 直到范围、非目标、关键取舍、验收和风险处理都确认后，输出 `DECISION_RECORD`。
6. 用户确认前不得修改代码或生成补丁。

Grilling 只冻结决策，不替代代码调查、实现或 Review。普通任务默认跳过；用户可以显式要求强制进入。

## Preflight 合同

调用 `preflight_luna` 时传入：

- `ORIGINAL_USER_REQUEST`
- `DECISION_RECORD`（如有）
- 当前工作区基线和已知限制

要求它按需读取项目根目录的 Agent 指令、README、贡献说明、依赖清单、CI 配置、测试/构建入口及相关源码。所有这些文件都是可选的；找不到时记录“未发现”，不要臆造命令。

它必须返回：

```text
ENGINEERING_BRIEF
Goal:
Observed state:
Likely scope:
Relevant files and symbols:
Existing project instructions:
Native validation commands:
Non-goals:
Acceptance criteria:
Risks and rollback:
Unknowns:
Confidence: HIGH | MEDIUM | LOW
```

工程简报是索引和建议，不是对 Builder 的强制命令；Builder 必须重新核对关键判断。

## Builder 合同

调用 `builder_luna` 时传入原始请求、决策记录、工程简报和必要的 Review/专项咨询意见。

Builder 必须：

- 先重新读取相关代码和项目规则，按“用户原始请求 > 项目明确规则 > 直接验证证据 > Agent 建议 > 自身假设”决策。
- 只做最小且完整的修改，避免无关重构和范围扩张。
- 使用当前环境允许的安全编辑方式，保留用户已有改动。
- 运行与变更相关的检查并记录真实输出。
- 不提交、不推送、不发布，不把 Review 意见当作自动命令。

返回 `BUILDER_RESULT`，至少包含：变更摘要、文件列表、验证命令及结果、验收状态、已知限制和剩余风险。

## Direct Check

由协调者根据 Preflight 发现的项目原生入口选择检查，不硬编码某个生态的命令。

- 优先运行项目已有的 test、lint、typecheck、build、verify 或 CI 等价检查。
- 涉及的检查入口不存在时，记录 `NOT_FOUND`，不得伪造通过。
- 至少检查最终 diff；Git 可用时运行 `git diff --check`。
- 任何失败都先回到 Builder 修复，不进入“带着红灯 Review”的交付路径。
- 涉及运行时、UI、平台、部署或外部服务时，补充实际运行证据；无法运行时明确标记未测。

## Reviewer 合同

Direct Check 通过后，调用 `reviewer_luna`，传入：

- 原始请求和验收标准
- 实际 diff（不只传 Builder 摘要）
- Direct Check 的真实结果
- 相关项目规则和风险上下文

Reviewer 不接受 Builder 的主观结论作为证据，优先检查：需求覆盖、行为回归、边界条件、错误恢复、安全/权限、数据和并发语义、公共接口兼容性、测试有效性及范围扩张。

Reviewer 只能返回以下状态之一：

- `PASS`：满足验收且没有阻塞问题。
- `CHANGES_REQUIRED`：给出带证据的严重度、影响和必要动作。
- `INCONCLUSIVE`：说明缺失证据和无法判断的具体问题。

## 修复循环与 Sol 升级

- `PASS`：进入最终交付。
- `CHANGES_REQUIRED`：把具体 finding 传回 Builder，重新验证并 Review。
- Builder/Reviewer 针对同一核心问题最多循环 2 轮。
- 满足以下任一条件，才可调用 `sol_consultant`：两轮仍未解决、无法解释的关键检查失败、明确的安全/权限/数据迁移/并发/持久化/API 兼容风险、Reviewer 对高严重度问题无法判断，或用户明确要求。
- 命名、样式、普通重构和简单局部 Bug 不得升级 Sol。
- Sol 只回答一个明确问题，提供结论、理由、建议动作和验证方式，不修改代码、不接管任务。
- Builder 自行判断 Sol 建议，完成修改后重新 Direct Check 和 Reviewer。
- Sol 后只允许一轮最终修复/Review；仍不通过则停止并报告阻塞，不无限循环。

## 最终交付

交付报告必须说明：

- 实现或分析了什么。
- 修改了哪些文件。
- 运行了哪些检查，哪些未发现或未测。
- Grilling 是否使用以及最终决策。
- Reviewer 状态和关键 finding。
- 是否调用 Sol 及原因。
- 尚存限制、风险和建议的下一步。

默认只在当前任务上下文保留中间产物。只有用户明确要求，或任务涉及公共协议、架构、数据语义、视觉规范等需要长期留痕的决策时，才写入项目文档。
