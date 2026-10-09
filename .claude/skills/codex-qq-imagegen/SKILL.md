---
name: codex-qq-imagegen
description: 通过本机 codex-qq 账户的内置 image_gen 工具生成或编辑图片。当用户要求生图、参考图创作、修改图片、透明背景游戏素材，或明确要求用 codex-qq 生图时使用。
---

# Codex QQ 生图

通过随附 Python 脚本启动 Codex CLI，使用 `~/.codex-qq` 的现有配置和登录态，让 Codex 调用自己的内置生图工具。Claude 本身不直接拥有该工具。无需配置 OpenAI Images API Key，不得静默切换到付费 Images API 或其他服务。

## 执行

1. 把需求写入 UTF-8 提示词文件，保留主题、风格、用途、比例/尺寸、准确文案、透明背景要求。编辑时写清“只改什么、保留什么”，并标记每张输入图是编辑目标还是风格参考。不必为非关键缺省项反复追问。
2. 从项目根目录调用本 skill 的脚本（若工作目录不同，使用脚本绝对路径），例如：

```bash
python3 .claude/skills/codex-qq-imagegen/scripts/generate.py \
  --prompt-file /absolute/path/prompt.txt \
  --output /absolute/path/output/icon.png
```

有参考图时追加一个或多个 `--reference /absolute/path/reference.png`。用户只在聊天中附图时，先取得可读取的本地图片文件；不要虚构路径。脚本会复制参考图到本次工作目录。

3. 生图常需数分钟。长任务使用 Claude 的后台 Bash 执行和任务输出机制等候，默认超时 900 秒，按需使用 `--timeout`。不要因为尚未返回就重复发起请求。
4. 成功时脚本输出 JSON，含 `output` 图片绝对路径和 `run_dir` 日志目录。读取实际输出图片检查内容、构图、文字及透明要求，然后向用户提供图片路径。若未实测尺寸或 alpha，不宣称它们已验证。

生成目录优先使用项目 `.workspace/imagegen/` 或美术源文件目录，验收后再放入 Cocos `assets/`，避免把运行日志导入资源库。

每次生成一张图；多张不同素材分别调用。输出仅支持 PNG，已存在的目标会被拒绝，编辑默认使用新文件名。`--dry-run` 只验证本地参数并展示调用命令，不验证账户登录或生图服务。

## 失败处理

非零退出、超时、登录失效、内置工具不可用时，检查返回的 `run_dir` 中 `response.json`、`events.jsonl`、`stderr.log` 和可能已生成的 `result.png`。区分成功生成但复制失败与真正生成失败，避免重复计费。不要把内部日志中的凭据或个人配置贴到对话中。

需要登录时让用户在终端运行 `CODEX_HOME="$HOME/.codex-qq" codex login`。不要读取或复制认证文件。Claude 若因沙箱/权限阻止启动 Codex、访问账户运行目录或联网，应使用自身正常权限申请；不得用绕过沙箱参数。不得改写账户配置或用户的 shell 配置。

已有图片可用时先交付真实产物。没有真实图片就明确报告失败，不把文字说明、占位图或推测路径当作成功。
