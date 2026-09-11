
## 2026-09-11 背景修订 v2

用户确认：背景加高以兼容长屏及顶部系统区域；天空云海底图与顶部浮岛、底部近景分别制作；图片要干净、少噪点。

当前候选：[background-tall-v2.png](background-tall-v2.png)。v1 不再作为最终生产底图，仅留构图参考。v2 为约 5:12 的加高不透明天空云海，移除浮岛、建筑、糖果；独立装饰层待生成。已目视检查中部留白、无 UI/岛屿残留，尚待用户确认和运行时适配验证。云仍有造型细节，不宣称完全无纹理或完成像素级降噪。

来源：exec-79638e59-ec84-4453-82e2-4702c664a553.png（与 v1 相同生成缓存目录）。内置 image_gen 编辑，以 v1 为参考。

### v2 完整提示词

```text
Edit the reference cloud candy environment into a clean TALL background base plate for a portrait mobile game. Output aspect ratio EXACTLY 5:12 (750x1800 design proportions; choose e.g. 1000x2400 pixels). Extend composition vertically, NEVER stretch existing artwork. Reference is color/style guidance, remove ALL floating islands, buildings, waterfalls, candy canes, lollipops and foreground sweets; these will be separate transparent layers later. Only pastel SKY AND A FEW SIMPLE CLOUD BANKS remain. Preserve cream-peach/pale lavender soft candy world atmosphere. User explicitly requests MUCH CLEANER imagery with NO noise: immaculate smooth gradients, broad gently shaded round cloud forms, no film grain, stippling, chalk, speckles, sparkles, little flecks, fine cloud turbulence, repetitive small puffs or rough textures. Crisp intentional large silhouettes softly shaded inside, not a blurry photograph. Center approximately x=12..88%, y=18..80% is spacious very low contrast pale peach/lavender sky, smooth and largely empty for bubble board and aim. A few broad distant cloud forms at top corners and gently layered large cloud banks near bottom outer edges, clean extended sky/cloud margins at top and bottom for variable screen heights. No focal objects. No UI, lettering, symbols, lines, balls, character, sun disk, stars, panels, checkerboard, borders or transparency. Opaque full-bleed high quality production-candidate background. Candy illustration rendered with smooth polished airbrush-like shading, limited detail density, elegant quiet composition. Tall 5:12 canvas is essential, not the reference 9:16 canvas.
```
