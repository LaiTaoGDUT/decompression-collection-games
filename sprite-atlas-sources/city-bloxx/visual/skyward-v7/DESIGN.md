# 云端天梯 · 都市摩天楼视觉改版

用户反馈旧版素材粗糙、HUD 像网页，并希望背景足够好看，让玩家愿意为看到更高处的风景继续叠楼。本版本把背景改为一条连续的高空旅程，并把 HUD 改为游戏化的金边奶油色招牌。取代 `sunlit-v1` 的天空渐变、旧 `visual/background` 天空图和灰色 3D 远景城市；楼块、吊机、装饰图集沿用。

## 冻结视觉

主题：云端天梯。关键词：温暖绘本质感、柔和体积光、从城市晨光一路升到银河、每一段都有新的地标。

- 背景：9 段竖向手绘天空连续拼接（城市晨空 → 摩天之巅 → 云海之上 → 金色晚霞 → 平流层 → 近地轨道 → 月光航道 → 星云深处 → 银河彼方），对应 `CITY_ALTITUDES` 的 9 个高度区。第 i 段在玩家达到第 i 区起始层数时恰好贴住屏幕底边，下一区总是从屏幕顶部露出一部分，作为继续叠楼的动力。最后的银河彼方由过渡深空与银河两张源图拼成 750×2124 的长段，必须高于常见最长屏（约 1750 设计像素）加 260 接缝：进入第 520 层后继续滚动，星云完全离开屏幕，到第 680 层段顶贴住屏幕顶边后停住，画面只剩银河与深空。
- 远景：透明的 U 形摩天楼天际线，左右高、中央低，作为位于街道深度 9 的广告牌随 3D 相机下沉，底部融入暖白薄雾。
- 地面：暖砂岩人字纹 + 奶油色分隔带的广场铺装，基座和路缘改为暖色石材。
- HUD：金色描边、奶油色面板、左侧圆形徽章的招牌和胶囊；金色主按钮、奶油色次按钮；红心生命；海军蓝丝带横幅；顶部带金币徽章的结算卡片。数字使用原有 `native-hud` 字体加墨蓝描边。

色板：象牙 #FFF7E6、墨蓝 #17334D、灰 #76818A、黄铜 #F5BC51、琥珀 #E8A23A、奶油 #FCEFD2、海军蓝 #1E3A5C、玫红 #FF8A7A、禁用 #A8B3BF；铺装平均色 #E6C8A2。

## 源文件

全部由 codex-qq-imagegen（内置 image_gen）生成，提示词见 `prompts.json`。

- `sources/sky-00-dawn.png` … `sources/sky-08-galaxy.png`：9 段天空；sky-01 起以 sky-00 为画风参考，并在提示词中规定了上下接缝颜色。`sources/sky-08-galaxy-approach.png` 是银河段下方的过渡深空（提示词见 `prompts.json` 的 `sky-08-galaxy-approach`），由 `tools/city-bloxx/prepare-skyward.py` 与银河自下而上拼接。
- `sources/city-skyline.png`：透明天际线。
- `sources/plaza-pavers.png`：无缝广场铺装。
- `hud-kit.png`、`zone-icons.png`：HUD 部件表和 9 枚高度区徽章，由 `build.py` 按 manifest 中的裁切、缩放和九宫格边距合入 `visual/hud/city-hud` 图集。
- 大厅封面：`sprite-atlas-sources/city-bloxx/visual/covers/city-cover-v3.png`，以内置 image_gen 参考新版楼层贴图、实机画面和晨空源图重绘。主楼统一为米白浮雕外墙、浅蓝边柱和深蓝双窗，金色吊机通过滑轮、吊绳与双点吊具悬吊下一层；云海围合主楼，远景城市压低，突出向上叠楼。右上角留出安静天空供大厅角标显示，无文字、无 UI。初始提示词与吊绳连接修正词分别为同目录 `city-cover-v3.prompt.txt`、`city-cover-v3-refine.prompt.txt`；原封面源图 v2 保留。按卡片显示尺寸等比缩至 308×231，再用 tinypng-batch 压缩写入 `assets/lobby-covers/visual/covers/city-bloxx/city-cover.jpg`，沿用原资源路径与 UUID。
- `hud-icons.png`：城市图标（米白楼群、陶土立柱、金色尖顶）与人口图标（蓝、红两个圆润小人），粗藏青描边与高光同 HUD 部件表（提示词见 `prompts.json` 的 `hud-icons`）；按最大显示尺寸 1:1 裁成 53×58 的 `icon-city` 与 44×41 的 `icon-people`，合入 `visual/sunlit/city-sunlit` 图集，取代旧的扁平珊瑚色剪影。
- `fx-kit.png`：落楼特效部件表（4 档“完美”评价字、光芒、光环、星光、尘雾），合入 `visual/fx/city-fx` 图集；评价字按连击档位切换，完美落楼叠加旋转光芒、扁平光环和扇形星光，所有落楼都有两团尘雾。
- `sources/building-floor-{coral,blue,lobby}.png`：楼层贴图，保持原有 UV 布局（立面窗格、楼板边带），由 `prepare-skyward.py` 缩放到 320² 输出到 `visual/cloudline/floor-*.png`。

完美落楼闪光：刚落下的完美楼层叠加一层同网格的加色副本，0.45 秒内暖金色闪亮后淡出，并随落地挤压形变；原版红黄卡通星与小黄十字换成 `fx-sparkle` 金色四角星，拖尾改为暖金色。楼体星光只属于完美落下的楼层：每层 6 颗大小不一的细碎 `fx-sparkle`，三分之一停在楼顶，其余错落在左右两侧，各自以不同周期闪烁旋转；楼层倒塌、人口结算时随之清除。原 `star`、`combo-star-*` 帧已从 `city-sunlit` 图集移除。

连击面板：屏幕右侧、横幅下方，不带底板。第一行「连击」与大号「×N」，第二行是 220 × 24 的宽进度条，随连击剩余时间缩短（剩余不足 34% 时闪烁），下面一行小字是待结算人口。落楼人数「+N」保持在刚落楼层的楼顶上方飘起；「完美 / 超赞」评价字以 0.85 倍大小出现在楼层右侧，并限制在屏幕内。

空中装饰：手绘天空本身已有云层，原生成的 `cloud-bank`、`cloud-streaks` 云朵装饰与画风冲突，已从环境配置和 `city-sunlit` 图集移除。

天空生灵（`CityBloxxSkyLife.ts`）：每段天空都有自己独有的动态装饰，挂在该段天空图下、以天空图像素坐标定位，随画面一起滚动，只在该段可见时创建和更新；位置与节奏由固定哈希决定，不消耗玩法随机数。只放在天空图上下 260 px 重叠带之外，避免被相邻段遮住。

| 高度区 | 动态装饰 |
| --- | --- |
| 城市街区 | 鸽群 V 字掠过（往返交替），晨光中上浮的暖色光尘 |
| 摩天之巅 | 两架纸飞机乘气流起伏滑翔，远处小鸟群 |
| 云海之上 | 云缝中缓慢呼吸摇曳的光束，两只扇翅滑翔的海鸥 |
| 金色晚霞 | 火光摇曳、缓缓升起的孔明灯，归巢的鸟群 |
| 平流层 | 闪烁的初星，偶尔划过的流星 |
| 近地轨道 | 两颗闪着指示灯飞过的卫星，星光 |
| 月光航道 | 细密的流星雨，银色月尘 |
| 星云深处 | 粉、青两色呼吸漂浮的星云光尘，星光 |
| 银河彼方 | 拖尾彗星掠过，密集星光与流星 |

素材：`sky-life-kit.png`（codex-qq 生图，以 sky-03 与 fx-kit 为画风参考，提示词见 `prompts.json` 的 `sky-life-kit`）提供飞鸟与海鸥各两帧扇翅、纸飞机、孔明灯、卫星、彗星；扇翅两帧以眼睛位置对齐裁切，切换时身体不跳动。`sky-life-glows.png` 由 `tools/city-bloxx/sky-life-glows.py` 程序生成白色柔光、流星拖尾和光束，运行时按各段色板染色。两者都按最大显示尺寸 1:1 合入 `visual/fx/city-fx` 图集。检查动画可用 `CITY_CAPTURE_TIMES=3,6,10` 让截图脚本在同一高度按不同动画时间多拍几张。

声音：配乐「Skyward」与 20 段音效见 `tools/audio/city-bloxx/README.md`。

吊机：吊臂从屏幕左缘外伸入，右侧留给连击面板；枢轴位于屏幕外并由吊具遮罩裁切，画面中不出现悬空的塔身或底座。

## 生产

1. `python3 tools/city-bloxx/prepare-skyward.py`：天空缩放到 750 宽，相邻两段在 260 px 重叠区做 smoothstep 交叉混合，使两张 JPG 的接缝像素完全一致；输出 `sky/`（在 `visual/` 之外，运行时按高度懒加载）、`configs/sky-panels.json`、`visual/skyline/city-skyline.png`（750 宽，1:1 显示）和 512² `visual/cloudline/pavers.png`（开启 mipmap）。
2. HUD 图集走 `sprite-atlas-sources/README.md` 的完整流程。横条类部件（招牌、胶囊、丝带）只设左右边距，运行时按帧原生高度显示，避免徽章被纵向拉伸；结算卡片按原生宽度 506 显示，只纵向切片，顶部金币中心位于卡片顶边下方 115 px。
3. 特效图集同样走 `build.py` 流程，文字在落楼点上方以过冲缩放弹出。
4. 成品统一用 tinypng-batch 压缩；重新运行 `prepare-skyward.py` 会覆盖已压缩的输出，需要重新压缩。
5. 天空图与天际线的 `.meta` 使用 `clamp-to-edge`：`repeat` 会让线性采样在图片边缘混入另一侧像素，表现为接缝处的灰色细线。
6. 源图修补（运行后都要重跑 `prepare-skyward.py`）：
   - `tools/city-bloxx/remove-cloud-sun.py` 去掉 sky-02 自带的太阳，金色晚霞的落日成为唯一的太阳；原图备份在 `local/city-bloxx-skyward/`。
   - `uv run --project ~/.audio-toolbox python tools/city-bloxx/soften-sunset-horizon.py` 把 sky-03 底部生成的硬蓝色带重绘为暖橙到粉紫的渐变，并把 sky-02 顶部从粉紫渐回天蓝，云海到晚霞的色变分散在约一屏高度内。它读取 `local/city-bloxx-skyward/sky-02-clouds-sunless.png`，重跑去太阳工具后需先删除这份备份。
