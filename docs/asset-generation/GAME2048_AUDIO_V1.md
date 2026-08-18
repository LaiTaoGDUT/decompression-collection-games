# T48 霓虹 2048 原创音频记录 V1

> 生成日期：2026-08-12  
> 状态：工程可导入并通过自动指标验证  
> 完整指标：[audio-v1-report.json](./audio-v1-report.json)

## 1. 原创方法

全部波形由 `tools/audio/generate-original-audio.js` 在项目内程序化合成，没有下载、采样或拼接外部音频。母带为 48 kHz 双声道 16-bit PCM WAV；运行文件为离线编码 MP3。T48 使用独立参数、文件名、目录和 Bundle 路由，不复用 L1 大厅或 W1 猫咪游戏音频。

## 2. 资产清单

- 24 秒无缝循环：`t48-neon-loop-v1`，电子和弦、低频脉冲、克制高频闪光，目标近似 -22 LUFS。
- 12 秒危急循环：`t48-danger-loop-v1`，在棋盘空格不多于 2 格时切入更密集的低频脉冲、上升扫描与警报音型，脱离危急状态后恢复常规循环。
- 9 个反馈 Cue：按钮、移动、无效移动、生成、合并、连锁、目标、失败、新纪录。
- WAV 母带：`audio_sources/generated/v1/game2048/master/`。
- MP3 运行文件：`assets/games/twenty48/visual/audio/`。

## 3. 接入与验证

- `BundleAudioBank` 在 `game-2048` Bundle 内加载并注册 Cue；暂停、切后台、完成本局、返回大厅和销毁时停止或解除引用。
- 11 个运行文件；循环边界采样差为 0；最高峰值不超过 -4 dBFS。
- 全量音频验证结果：`assets=28, wav=RIFF/48kHz, mp3=valid, music_seams=0, peaks<=-2dBFS, bundle_routes=isolated`。
