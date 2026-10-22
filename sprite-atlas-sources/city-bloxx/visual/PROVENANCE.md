# 高清素材来源

生成工具：内置 image_gen。生成会话 `01a15005-1110-76a1-9646-6f976ad6be87`。

- `buildings/blue-house-hd-v1.png` ← `exec-38819dac-f32b-4965-b674-360aa8eba3ed.png`，以原 blue_house UV 图作参考。约束保留每块 UV 区域位置与边界，蓝绿墙面、奶油白窗框、锐化玻璃及微弱材质纹理。
- `buildings/yellow-base-hd-v1.png` ← `exec-2c8f0add-d6b7-44c0-8c62-f6330eeb980a.png`，以原 house_yellow_B 作参考。保留 UV 区域，黄赭墙面、灰色转角、青色玻璃和首层入口。
- `buildings/yellow-floor-hd-v1.png` ← `exec-6ef5676c-fae5-4482-b308-8a4dc4d018bd.png`，以原 house_yellow_m 作参考。保持楼层立面及四格窗 UV 配置，去像素化。
- `background/city-day-hd-v1.png` ← `exec-1ad55175-b0ea-4146-826b-63eb9ef8aa83.png`。竖屏晴空城市，顶部 75% 留出天空，远景城市只在底部，无中央楼、文字或 UI。
- `covers/city-cover-hd-v1.png` ← `exec-3f27e0c6-1f83-4ce9-8e49-58c3f9c4e613.png`。4:3 横构图，暖黄楼体略错位堆叠、吊机、晴空，无文字。
- `scenery/scenery-hd-v1.png` ← `exec-2dc6d34d-9cd1-4c5c-bc5f-6dabd6d2c94c.png`。完整提示词保存于 `scenery/generation-prompt.txt`；原输出透明，第 4 行吊机较宽，按实际分隔裁切，不改画面内容。

运行图片由 scaffold.py / prepare-scenery.py 缩小；装饰最后使用项目 build.py 合图。请保留这些源文件，修改时从源图重新生成成品，再执行 Tinify 压缩。

- `buildings/stone-hd-v1.png` ← `exec-1746f612-f549-4a32-90b3-307101b6fdf8.png`。正交俯视、6 × 6 暖白砂岩铺砖、细灰色嵌缝、无透视无物件的无缝贴图，缩小为 384² 用于施工平台。
