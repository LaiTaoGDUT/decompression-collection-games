# 左上浮岛制作记录

2026-09-11：背景 v2 获用户确认后，开始左上饼干屋浮岛。使用内置 image_gen，以已确认普通界面为参考。

当前文件 island-left-visual-only-v2.png 仅为造型候选，不是生产素材。两次要求真实透明均未得到 alpha，灰棋盘格是 RGB 像素。不得误报为透明，不得导入运行时。第二次去除了新增瀑布，但与原图的一致性仍需用户检查。

第一次来源 exec-41d0cfbe-4536-4e7b-9999-5d3d56fc1f30.png，第二次来源 exec-ad69c7d4-bde0-4ec2-b0cc-ff7922d86b9c.png，均位于当前会话已记录的生成缓存目录。保存第二版至项目。

## 用户要求明确透明输出后的再次尝试

用户要求调用生图工具时明确透明要求。再次直接调用内置 image_gen，输出 exec-00581dd4-8a0e-4b73-8f4d-dc7667555cfd.png。文件检查仍为 RGB，无 Alpha、无 transparency 元数据；不能作透明生产资产。未覆盖项目候选图，也未擅自切换 CLI 或脚本抠图。

```text
请直接输出真正透明背景的 PNG 素材，启用透明背景输出，文件需要真实 Alpha 通道（RGBA）。这是抠图编辑：保留参考图中的完整饼干屋浮岛、棒棒糖、树和岛体，移除物体以外所有灰白格子与背景噪点。参考图里的棋盘格是错误的背景像素，必须全部删除，包括房屋和棒棒糖之间的空隙。背景像素 Alpha=0，物体边缘抗锯齿，不能绘制棋盘格来模拟透明，不能替换成白底、灰底或其他实色底。主体造型、构图、尺寸、颜色、材质保持不变，不添加瀑布、云雾、影子、文字、UI。透明画布四周保留空隙，完整显示物体，无裁切。Deliver a genuinely transparent-background RGBA PNG cutout. Preserve actual transparency in the output file, not a flattened preview.
```

## 原始生成提示词

```text
Use case background-extraction / isolated game asset. Use approved screenshot as reference ONLY for the TOP LEFT cookie house floating island. Generate exactly ONE standalone transparent PNG sprite of that island, isolated on genuinely transparent alpha background, no sky, no checkerboard painted into image. Match original design and viewing angle: small warm caramel gingerbread cottage with cream frosting roof, tiny chimney, heart window, rounded door, pink spiral lollipop rising to its right, a few rounded pastel shrubs on pale pistachio/cream icing ledge, tapered floating rocky-candy underside in soft peach and lavender. Reconstruct entire island silhouette unobscured, including complete lollipop and tapered underside. Keep original charming soft candy illustration, clean polished gently shaded large forms, mild upper-left warm highlights. User wants CLEAN and NO NOISE: no grain, speckled texture, scattered sprinkles, floating particles, sparkles, gritty rock details, hundreds of tiny decorations. Cottage details legible at small in-game size. ONE island only, not a sprite sheet. Center object with generous transparent margin on all sides, nothing cropped, no cast shadow on a ground plane, no surrounding cloud bank or mist rectangle. Outline anti-aliased with clean transparent edges. No pause, bubble, label, badge, UI, text, boss, other islands or castle. Approx square canvas suitable for later proportional resizing. True RGBA transparent background is essential.
```

## 第二次修正指令

移除所有灰棋盘格像素，要求真实 alpha=0 的 RGBA PNG；保留饼干屋、棒棒糖、浮岛，移除前侧瀑布并补回糖霜台面和岩体。输出仍未满足透明要求。后续需继续通过图像工具解决，或在用户明确授权其他图像处理方式后进行抠图，不能假装已经完成。
