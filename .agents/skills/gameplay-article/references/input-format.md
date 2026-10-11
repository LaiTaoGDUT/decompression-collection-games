# 输入与输出

`build.cjs` 负责排版、选取当前封面、检查尺寸和打包。它不会推断玩法或自动写正文。运行前由当前助手阅读实际规则，再准备本次 JSON。

## 本次文章 JSON

| 字段 | 内容 |
| --- | --- |
| `gameId` | Manifest 中的唯一 ID；脚本从清单取正式游戏名。 |
| `title` | 发布标题，不含换行，最多 45 个 Unicode 字符。 |
| `body` | 完整正文字符串，用空行分段。 |
| `subtitle` | 封面副标题，建议 12～24 字。 |
| `pointsHeading` | 要点卡的小标题，如「先记住这四条」。 |
| `points` | 3～4 项，每项 `{ "label": "短要点", "detail": "规则或技巧说明" }`。`label` 用在封面与正文卡；`detail` 用在正文卡，不必过短，建议 15～45 字。 |
| `coverDetails` | 可选，与 `points` 数量相同的短句数组；只在封面显示，建议每句不超过 14 字。没有时封面只显示短要点。 |
| `coverNote` | 可选，要点卡底部的补充说明，建议最多 14 字。 |
| `footer` | 操作提示或交流邀请，建议最多 30 字。 |
| `palette` | 六位十六进制色值：`background`、`tint`、`ink`、`muted`、`marker`；结合该游戏主题选色，文字与背景需有足够对比。 |
| `sources` | 本次已读取的规则来源，数组项为 `{ "path": "项目相对路径", "supports": "此文件支持的事实" }`。至少一项；不要只填清单而不读规则。 |
| `hero` | 可选，替换主原画的路径。没有时按 Manifest 的 `cover` 精确定位。 |
| `heroFit` | 可选，`cover`（默认）或 `contain`。角色或棋盘被裁掉时使用 `contain`，不改变图片框位置和尺寸。 |
| `brandLogo` | 可选，替换品牌 PNG 的路径。默认使用当前项目正式 logo。 |
| `bodyImages` | 可选，额外正文配图数组；每项 `{ "path": "图片路径", "caption": "准确的图片说明" }`。保留原格式和像素，不加工原图。 |
| `preview` | 可选。Manifest 游戏非公开或未启用时，需要设为 `true`；输出会标记「待上线 · 玩法介绍」。 |

相对路径以项目根目录解析。用户提供的本地截图可使用绝对路径。输入本身应保存在本次输出工作区，不写进 skill 的示例或原始游戏资源。

查看可用游戏（这一步无需图形依赖）：

```bash
node scripts/build.cjs --project /path/to/project --list-games
```

生成素材：

```bash
node scripts/build.cjs \
  --project /path/to/project \
  --spec /path/to/article.json \
  --output /path/to/project/output/gameplay-articles/meowdoku \
  --modules /path/from/load_workspace_dependencies/node_modules
```

上面 `node` 应替换为依赖工具返回的 Node 可执行文件，脚本也应使用当前 skill 下的绝对路径。`--modules` 是包含 `@napi-rs/canvas` 和 `jszip` 的 Node 包目录；若正常 Node 模块解析已能找到这些包，可省略。不要把示例中的占位路径原样执行。

其他选项：

- `--manifest`：不同项目的游戏清单路径，默认 `assets/resources/configs/games.json`。
- `--font`：中文字体文件路径。脚本优先尝试 macOS 黑体、冬青黑体及常见 Windows/Linux 中文字体；找不到时明确失败，不下载或修改全局字体。
- `--help`：命令选项。

## 固定封面

布局版本为 `cover-layout-v1`。尺寸和坐标集中保存在 `assets/cover-layout-v1.json`；参考图是 `assets/cover-reference.jpg`。常规生成只填写 JSON，不改模板文件。

Logo 等比绘制；主原画在固定框内按 `cover` 或 `contain` 等比适配。文字按实际字宽在指定字号范围内缩小，最小字号仍放不下时明确失败；不截字、不拉伸、不把文字画出边界。封面要点多时仍保持左侧卡、右侧图及底部短句的位置。

用户明确要求改变统一格式时，再修改模板并升级版本，同时更新参考图；不要为单个长标题偷偷改全局版式。

## 每篇的交付文件

```text
标题.txt
正文.txt
封面.jpg                     1200 × 900
正文配图/
  01-玩法原画.<原格式>       当前官方原画或用户指定图片
  02-玩法要点.jpg             1200 × 1200
  03-….<原格式>              用户指定的额外图片（如有）
品牌标题.png
发帖预览.html                标题、正文复制按钮和配图下载入口
使用说明.txt
article.json                 本次输入快照
核对结果.json                模板版本、来源、尺寸与文字排版结果
发布素材.zip
```

同名输出目录自动添加 `-2`、`-3` 等后缀。脚本不覆盖已有素材；完成后以输出 JSON 中返回的实际目录交付。
