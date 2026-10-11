# 音效数据包

泡泡奇境的短音效原始 MP3 和原 `.meta` 保存在 `bubble-shooter/visual`，不进入 Cocos 的 `assets` 目录。音乐仍是 Bundle 中的独立 AudioClip。

重新打包：

```sh
python3 audio-bank-sources/build.py
python3 audio-bank-sources/build.py --check
npm run verify:audio
```

构建器按公共、云境、海洋、玩具、魔法生成五个 `.bin` 文件，放在 `assets/game-assets/bubble-shooter/audio-banks`。每个包包含 ASCII 索引和原始 MP3 字节；不拼接音频时间轴、不重新编码。索引中保存原资源路径、字节偏移和长度，所以所有音效变体都可以逐字节恢复。

文件头是八字节 `AUDIOBNK`，随后是四字节小端索引长度、JSON 索引，以及按索引顺序排列的 MP3 数据。偏移相对于 MP3 数据区起点。

运行时通过 AssetService 加载 BufferAsset 并缓存包，公共音频服务使用平台 WebAudio 解码每个音效。每个区域只加载公共包和当前主题包。六个独立声部保留音效叠加；暂停、切后台、关闭音效和退出游戏会停止声部并释放引用。解码缓冲作为派生 Asset 归属游戏 Bundle，随 Bundle 一起释放。

修改音效时替换这里的源 MP3，再执行构建器；不要直接修改成品 `.bin`。刷新 Cocos 资源后可重新预览。微信端需要支持 `createWebAudioContext` 的基础库。
