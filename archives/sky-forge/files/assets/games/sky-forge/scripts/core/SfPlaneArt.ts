/** 由 tools/sky-forge-v2/build_assets.py 生成：机体尺寸、喷口与零件挂法（设计像素，机体中心为原点，y 向上）。请勿手改。
 * main / wing / special 为零件前缘锚点（x 取右侧，左侧镜像），也是开火点；
 * fit[slot] = [protrude, under]：零件伸出锚点之前的比例，以及是否压在机体下层。 */
export const PLANE_ART: Readonly<Record<string, { main: [number, number]; wing: [number, number]; special: [number, number]; fit: Record<"main" | "wing" | "special", readonly [number, boolean]>; size: [number, number]; nozzles: readonly [number, number][] }>> = {
    vanguard: { main: [16, 22], wing: [29, -1], special: [51, -24], fit: { main: [0.62, true], wing: [0.5, false], special: [0.45, false] }, size: [128, 137], nozzles: [[-12, -66], [12, -66]] },
    thunder: { main: [16, 17], wing: [32, 8], special: [56, -3], fit: { main: [0.62, true], wing: [0.5, false], special: [0.45, false] }, size: [140, 109], nozzles: [[-14, -52], [14, -52]] },
    falcon: { main: [14, 23], wing: [30, 6], special: [52, -16], fit: { main: [0.62, true], wing: [0.5, false], special: [0.45, false] }, size: [130, 144], nozzles: [[0, -70]] },
    lightning: { main: [22, 15], wing: [30, 8], special: [52, -16], fit: { main: [0.62, true], wing: [0.5, false], special: [0.45, false] }, size: [130, 96], nozzles: [[-12, -46], [12, -46]] },
    frost: { main: [22, 20], wing: [30, 0], special: [52, -16], fit: { main: [0.62, true], wing: [0.5, false], special: [0.45, false] }, size: [130, 122], nozzles: [[-10, -58], [10, -58]] },
    phantom: { main: [16, 20], wing: [31, 2], special: [54, -16], fit: { main: [0.62, true], wing: [0.5, false], special: [0.45, false] }, size: [136, 127], nozzles: [[-15, -61], [15, -61]] },
    dawn: { main: [22, 19], wing: [30, 16], special: [52, -14], fit: { main: [0.62, true], wing: [0.5, false], special: [0.45, false] }, size: [130, 120], nozzles: [[-10, -58], [10, -58]] },
    wildgoose: { main: [14, 18], wing: [30, -5], special: [52, -26], fit: { main: [0.62, true], wing: [0.5, false], special: [0.45, false] }, size: [130, 111], nozzles: [[0, -53]] },
    blackhole: { main: [16, 21], wing: [31, -2], special: [53, -24], fit: { main: [0.62, true], wing: [0.5, false], special: [0.45, false] }, size: [134, 132], nozzles: [[-14, -64], [14, -64]] },
    swordfish: { main: [10, 28], wing: [29, -18], special: [51, -36], fit: { main: [0.62, true], wing: [0.5, false], special: [0.45, false] }, size: [128, 178], nozzles: [[0, -86]] },
    dragon: { main: [34, 25], wing: [27, 21], special: [48, 16], fit: { main: [0.62, true], wing: [0.5, false], special: [0.45, false] }, size: [120, 157], nozzles: [[-20, -76], [0, -76], [20, -76]] },
    chakram: { main: [12, 38], wing: [47, 2], special: [62, -26], fit: { main: [0.62, true], wing: [0.5, false], special: [0.45, false] }, size: [140, 136], nozzles: [[-26, -40], [26, -40]] },
};

/** 零件精灵中心相对机体中心的 y（按该级零件贴图高度计算）。 */
export function partCenterY(plane: string, slot: 'main' | 'wing' | 'special', height: number): number {
    const art = PLANE_ART[plane];
    if (!art) return 0;
    return art[slot][1] + height * (art.fit[slot][0] - 0.5);
}
