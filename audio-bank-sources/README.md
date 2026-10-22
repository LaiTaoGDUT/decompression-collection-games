# 音效数据包

泡泡奇境的短音效原始 MP3 和原 `.meta` 保存在 `bubble-shooter/visual`，不进入 Cocos 的 `assets` 目录。音乐仍是 Bundle 中的独立 AudioClip。

解个圆环（rotate-rings）的19段短音效保存在`rotate-rings/visual/audio`，`rotate-rings/banks.json`列出全部19段（16段v2音效 + 3段连击配音）。正式资源为`visual/audio/rings-effects.bin`和两首独立循环`rings-play-loop-v2`、`rings-title-loop-v2`。v2音乐与音效由`tools/audio/rotate-rings`制作，见其README。三档连击女声 Nice / Great / Excellent 分别原样复制猫咪数独的 `meowdoku-combo-1-v1`、`meowdoku-combo-2-v1`、`meowdoku-combo-4-v1`，使用圆环独立的 `rr_vo_good`、`rr_vo_great`、`rr_vo_excellent` 文件、原 `.meta` 和音效包，不共享运行时资源；首档沿用旧资源名，提示文字为 Nice。

篮球灌篮（flappy-dunk）的 9 段短音效及原 `.meta` 保存在 `flappy-dunk/visual/audio`，由 `flappy-dunk/banks.json` 列出，正式资源为 `assets/game-assets/flappy-dunk/visual/audio/dunk-effects.bin`。环境声循环 `night-ambience-loop-v1.mp3` 保持为独立 AudioClip，由游戏的环境声声部控制循环、淡入淡出和暂停恢复。

乒乓球（pingpong）的 12 段短音效保存在 `pingpong/visual/audio`，由 `pingpong/banks.json` 列出，正式资源为 `assets/game-assets/pingpong/visual/audio/pingpong-effects.bin`。全部由 `tools/pingpong/make-audio.py` 生成（击球与落台截取自 BudgetPixel AI「Quick Ping Pong Rally」录音，CC BY 4.0，署名见 `THIRD_PARTY_NOTICES.md`；翻牌与按钮为程序合成；提示音为 GeneralUser GS 马林巴与掌声），并自动合包。背景音乐 `court-groove-loop-v1.mp3` 由 `tools/pingpong/make-music.py` 生成，作为独立 AudioClip 放在游戏音频目录。

重新打包：

```sh
python3 audio-bank-sources/build.py
python3 audio-bank-sources/build.py --check
python3 audio-bank-sources/build.py --game rotate-rings
python3 audio-bank-sources/build.py --game rotate-rings --check
python3 audio-bank-sources/build.py --game flappy-dunk
python3 audio-bank-sources/build.py --game flappy-dunk --check
python3 audio-bank-sources/build.py --game pingpong
python3 audio-bank-sources/build.py --game pingpong --check
npm run verify:audio
```

构建器按公共、云境、海洋、玩具、魔法生成五个 `.bin` 文件，放在 `assets/game-assets/bubble-shooter/audio-banks`。每个包包含 ASCII 索引和原始 MP3 字节；不拼接音频时间轴、不重新编码。索引中保存原资源路径、字节偏移和长度，所以所有音效变体都可以逐字节恢复。

默认构建泡泡奇境；`--game rotate-rings`复用相同格式输出圆环音效包到`assets/game-assets/rotate-rings/visual/audio`。更新圆环音效时用`tools/audio/rotate-rings/sfx.py`重新生成源MP3后合包，两首循环由`music.py`生成并作为独立AudioClip放在游戏音频目录。

`--game flappy-dunk` 同样读取该游戏的 `banks.json`，输出篮球短音效包。`tools/flappy-dunk/make-event-sfx.py` 将重做的短音效写入源目录并自动合包；环境声由 `tools/flappy-dunk/make-night-ambience.py` 单独生成。

文件头是八字节 `AUDIOBNK`，随后是四字节小端索引长度、JSON 索引，以及按索引顺序排列的 MP3 数据。偏移相对于 MP3 数据区起点。

运行时通过 AssetService 加载 BufferAsset 并缓存包，公共音频服务使用平台 WebAudio 解码每个音效。每个区域只加载公共包和当前主题包。六个独立声部保留音效叠加；暂停、切后台、关闭音效和退出游戏会停止声部并释放引用。解码缓冲作为派生 Asset 归属游戏 Bundle，随 Bundle 一起释放。

`BundleAudioBankConfig.packedEffects`允许通用Cue注册表直接引用音效包内的原路径，`FeedbackService`统一接收AudioClip或PackedAudioEffect。配置合包时，全部短音效和配音归本局声部Scope持有；音乐加载和切换保持独立。未配置合包的游戏继续加载原AudioClip。圆环保留alwaysLoad，静音进入也准备并解码全部19段，切关无需再下载。

修改音效时替换这里的源 MP3，再执行构建器；不要直接修改成品 `.bin`。刷新 Cocos 资源后可重新预览。微信端需要支持 `createWebAudioContext` 的基础库。

咧咧团快跑（meme-runner）的 20 个动作音效由 `tools/meme-runner/make-audio.py` 制作，使用 GeneralUser GS 乐器和确定性布料／木质／软垫合成，源 MP3 与元数据保存在 `meme-runner/visual/audio`。`python3 audio-bank-sources/build.py --game meme-runner` 输出独立的 `runner-effects-v18.bin`。原创 128 BPM、30 秒循环保留为 `assets/game-assets/meme-runner/visual/audio/street-groove-loop-v18.mp3`；所有声音与图形帧都由本游戏自己的 Bundle 持有。制作配方、测量和试听见 `docs/games/meme-runner/production-v18.html`。
