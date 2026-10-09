---
name: tinypng-batch
description: 使用 Tinify 官方 API 批量压缩 PNG、JPEG、WebP、AVIF 图片，支持配置多个 API Key、额度切换、轮询和内容缓存。用于用户请求压缩图片或减小图片资源体积；不用于图片生成、裁剪或格式转换。
---

# 批量压缩图片

使用本技能目录中的 `scripts/compress.py`，需要 macOS/Linux 和 Python 3.9+，仅使用标准库。图片会上传至 Tinify，属于有损优化，不承诺像素级无损。默认保持格式和尺寸，不请求缩放或转换。

## 配置 Key

按顺序读取：`--keys-file` 指定的 JSON 文件、环境变量 `TINIFY_API_KEYS`（JSON 字符串数组）、项目根目录下 `local/tinypng-batch/keys.json`。不读取用户全局配置。项目内的 Key 文件已加入 `.gitignore`，且压缩脚本会自动发现它。文件格式：

```json
{
  "api_keys": ["YOUR_FIRST_API_KEY", "YOUR_SECOND_API_KEY"]
}
```

指导用户在本地编辑该文件并设置 `chmod 600`。不要打印、提交 Key 或把真实 Key 写入命令行、技能文件、报告。缺少配置时先用 `--dry-run` 列出范围，再请用户在本地配置。重复 Key 自动去重。使用用户有权使用的账号；不自动注册账号，也不声称多账号可获得官方认可的叠加免费额度。

## 执行

将下面的 `<skill-dir>` 替换为本 SKILL.md 所在目录，输入可以是多个文件或目录，目录递归扫描：

```bash
python3 <skill-dir>/scripts/compress.py assets/game-assets --dry-run
python3 <skill-dir>/scripts/compress.py assets/game-assets --output tmp/compressed-images
python3 <skill-dir>/scripts/compress.py assets/game-assets --in-place
python3 <skill-dir>/scripts/compress.py images --strategy round-robin --exclude '**/references/**'
```

- 首先 dry-run 确认范围。用户未指定文件范围时询问；不擅自压缩整个仓库。
- 默认输出到当前工作目录的 `tinypng-output/`。多个输入按共同根目录保留路径，避免同名文件冲突。扫描自动排除输出和缓存子目录；输出目录不能等于或包含输入目录。只有用户要求替换原图或明确要缩小项目现有资源时使用 `--in-place`；已有授权不重复询问。
- 默认 `--strategy ordered`：尽量使用当前 Key，额度耗尽或 Key 无效时切换；`round-robin` 每张图片轮换。临时限流会对当前 Key 有限退避，不用换 Key 规避限流。全部 Key 不可用时停止并返回失败。
- 默认 `--monthly-limit 500`：先查询各账号当月计数，再控制该次运行的后续请求。配置大于 500 或 `0`（不设本地上限）前，应有用户使用付费额度的授权。此上限不是账单保证：其他进程、多个 Key 对应同一账号或网络结果不明都可能影响计数。
- 网络超时的上传不自动重试，以免重复计费；GET 下载和明确的限流/服务端错误最多重试两次。失败文件保留原图，其余继续处理，最终非零退出。再次运行会复用成功缓存；失败上传可能已在服务端消耗额度。
- 成功结果经过格式签名、MIME 与响应长度检查，只采用更小的结果；否则保留原始字节。相同输入及已压缩输出均记录哈希，避免重复有损压缩。缓存默认 `~/.cache/tinypng-batch`（尊重 `XDG_CACHE_HOME`），可用 `--cache-dir` 指定；使用相同缓存的批次通过文件锁串行保护。不要同时向同一批目标运行不同缓存的实例。
- 跳过符号链接、隐藏路径和常见生成目录（`library`、`temp`、`tmp`、`build`、`node_modules` 等），可用多个 `--exclude` 加排除规则。输出使用同目录临时文件原子替换，保留已有目标权限；不会触碰 `.meta`。
- Cocos 项目原地压缩后，按项目要求调用 `cocos_creator_stdio` 刷新修改资源。报告处理数、缓存命中、失败数与节省字节；不要把模拟测试称作真实 API 验证。

详细参数：`python3 <skill-dir>/scripts/compress.py --help`。

API 协议参考：https://tinify.com/developers/reference/http 。当前脚本仅执行压缩；不保留 EXIF 等图片内元数据，Cocos 外部 `.meta` 文件不受影响。
