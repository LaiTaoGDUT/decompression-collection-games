import { Color, Graphics, Layers, Node } from 'cc';
import { ENDLESS_SWORD_CONFIG } from '../config/GameConfig';
import { SeededRandom } from '../core/SeededRandom';

// SW1 玄青荒原占位色（视觉规范 §2）。正式素材接入后替换为无缝 Tile 贴图。
const TILE_BASE = new Color(21, 37, 33, 255); // #152521
const TILE_PATCH = new Color(16, 30, 26, 255);
const TILE_SCRATCH = new Color(13, 24, 21, 255);
const TILE_STONE = new Color(26, 44, 39, 255);
const TILE_RUNE = new Color(30, 58, 51, 255);

/**
 * 3×3 循环 Tile 无限背景（策划案 §8）。
 * 玩家跨越 Tile 边界时重排外围 Tile，节点数恒定 9 个；
 * 每个 Tile 的装饰由 (runSeed, tileX, tileY) 确定性生成，保证同 seed 复现。
 */
export class WorldBackground {
    private readonly tileSize: number;
    private readonly halfGrid: number;
    private readonly tiles: Node[] = [];
    private centerTileX = Number.NaN;
    private centerTileY = Number.NaN;
    private worldSeed = 0;

    constructor(parent: Node) {
        this.tileSize = ENDLESS_SWORD_CONFIG.world.tileSize;
        this.halfGrid = Math.floor(ENDLESS_SWORD_CONFIG.world.tileGrid / 2);
        const count = ENDLESS_SWORD_CONFIG.world.tileGrid * ENDLESS_SWORD_CONFIG.world.tileGrid;
        for (let i = 0; i < count; i += 1) {
            const tile = new Node('Tile');
            tile.layer = Layers.Enum.UI_2D;
            parent.addChild(tile);
            tile.addComponent(Graphics);
            this.tiles.push(tile);
        }
    }

    setSeed(seed: number): void {
        this.worldSeed = seed >>> 0;
        this.centerTileX = Number.NaN;
        this.centerTileY = Number.NaN;
    }

    update(playerX: number, playerY: number): void {
        const cx = Math.floor(playerX / this.tileSize);
        const cy = Math.floor(playerY / this.tileSize);
        if (cx === this.centerTileX && cy === this.centerTileY) {
            return;
        }
        this.centerTileX = cx;
        this.centerTileY = cy;
        let index = 0;
        for (let dy = -this.halfGrid; dy <= this.halfGrid; dy += 1) {
            for (let dx = -this.halfGrid; dx <= this.halfGrid; dx += 1) {
                this.drawTile(this.tiles[index], cx + dx, cy + dy);
                index += 1;
            }
        }
    }

    private drawTile(tile: Node, tileX: number, tileY: number): void {
        tile.setPosition(tileX * this.tileSize, tileY * this.tileSize, 0);
        const graphics = tile.getComponent(Graphics);
        if (!graphics) {
            return;
        }
        graphics.clear();
        const half = this.tileSize / 2;
        graphics.fillColor = TILE_BASE;
        graphics.rect(-half, -half, this.tileSize, this.tileSize);
        graphics.fill();

        const rng = new SeededRandom(this.tileHash(tileX, tileY));
        const inner = half * 0.78;

        // 暗色地面斑块
        graphics.fillColor = TILE_PATCH;
        const patches = rng.int(3, 5);
        for (let i = 0; i < patches; i += 1) {
            graphics.circle(rng.range(-inner, inner), rng.range(-inner, inner), rng.range(70, 170));
            graphics.fill();
        }

        // 破碎剑痕
        graphics.strokeColor = TILE_SCRATCH;
        const scratches = rng.int(1, 2);
        for (let i = 0; i < scratches; i += 1) {
            graphics.lineWidth = rng.range(4, 9);
            const x1 = rng.range(-inner, inner);
            const y1 = rng.range(-inner, inner);
            const x2 = x1 + rng.range(-260, 260);
            const y2 = y1 + rng.range(-260, 260);
            graphics.moveTo(x1, y1);
            graphics.lineTo(x2, y2);
            graphics.stroke();
        }

        // 碎石
        graphics.fillColor = TILE_STONE;
        const stones = rng.int(3, 6);
        for (let i = 0; i < stones; i += 1) {
            graphics.circle(rng.range(-inner, inner), rng.range(-inner, inner), rng.range(8, 22));
            graphics.fill();
        }

        // 少量古老阵纹
        if (rng.next() < 0.3) {
            graphics.strokeColor = TILE_RUNE;
            graphics.lineWidth = 3;
            graphics.circle(rng.range(-inner * 0.5, inner * 0.5), rng.range(-inner * 0.5, inner * 0.5), rng.range(60, 130));
            graphics.stroke();
        }
    }

    private tileHash(tileX: number, tileY: number): number {
        return (this.worldSeed ^ Math.imul(tileX, 73856093) ^ Math.imul(tileY, 19349663)) >>> 0;
    }
}
