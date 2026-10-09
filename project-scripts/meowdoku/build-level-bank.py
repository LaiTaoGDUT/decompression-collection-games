#!/usr/bin/env python3
"""生成 `assets/games/meowdoku/scripts/MeowdokuLevels.ts` 的关卡序列。

数据来源是 Meowdoku（com.oakever.meowdoku）Android 包里的题库 json。这些 json
在运行时用固定串循环异或（见原作 `scripts/module/bank/model/level_bank_io.gd`），
本脚本负责解密并复现原作的取关流程。

用法：

    # 直接从 xapk / apk 里取题库（推荐）
    python3 project-scripts/meowdoku/build-level-bank.py \
        --xapk ~/Downloads/Meowdoku_+Brain+Puzzle+Games_1.18.0_APKPure.xapk

    # 或者指向已经解密的题库目录
    python3 project-scripts/meowdoku/build-level-bank.py --banks /tmp/meowdoku-levels

    # 只校验不写文件
    python3 project-scripts/meowdoku/build-level-bank.py --banks ... --check

出题规则（题源、筛题与原作默认组 NLControlStrategy 一致；边长与难度是本项目
为 3000 关固化的确定曲线，不随机、不做 DDA；前 2000 关保持原有题目与顺序）：

1. 边长：1..10 关 = 4/5/6/6/8/6/7/8/9/7（原作教学段）；之后按阶段每 10 关一组循环，
   见 `SIZE_PHASES`。最大 10x10。
2. 难度档 rank：1..5 关 = 1，6..20 关 = 2；之后按阶段每 10 关一组锯齿，见
   `RANK_PHASES`。难关（rank 5）从第 51 关起每 20 关一次（个位为 0 且能被 20 整除），
   其余个位为 0 的关用 4。
3. 题池：`bankData{N}x{N}` 与 `bankDataLKStyle{N}x{N}` 的该 rank 档（10x10 rank1 再并入
   `bankDataGC10x10`）。rank 2..5 优先只取 tier == "N" 的题，该档没有 N 题时不筛。
   第 51 关起（原作 main path）：10x10 rank 3/4 不用常规题库；每交付 4 道普通题插 1 道
   `bankDataLKModified`（同边长、同 rank，排除原作保留题号），插完即止。
4. 游标：每个 (边长, rank, tier) 一个游标按题库顺序往后取；第 51 关起接着前面的进度。
5. 筛题：单格颜色区最多 1 个（原作 `single_region_num` 默认档 ALL_ONE；LKModified 不受限）；
   答案必须合法；整份关卡内同一道题（含 8 种旋转/镜像）只出现一次。
   任何题池被取空都直接报错，不回绕、不出重复题。
6. 1..10 关按 `LevelData.compute_prefill` 预置一只猫。
7. 不出原作特殊关（SP / LK 图案题）、11x11 以上的盘，也不用 A/B 实验组的题库。
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import os
import sys
import zipfile
from collections import Counter

# 原作 `level_bank_io.gd` 的 `_KEY`。
BANK_XOR_KEY = b"meowdoku-2026-bank-secret"

ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"

# 原作 `board_view.gd` 的 `region_color` 默认档（NEW_CELL_ONLY），12 色。
REGION_PALETTE_HEX = [
    "#CDA400", "#D36F8F", "#8979DA", "#F89BE5",
    "#FA9D5C", "#FBD983", "#5076A5", "#A5C6E7",
    "#38A9C0", "#2A8C53", "#8BD57D", "#A86D4A",
]

# 原作 `LevelGenerator.compute_color_map*` 的采样 RGB 表。
COLOR_MAP_RGB = [
    [230, 168, 193], [193, 101, 138], [145, 121, 209], [254, 160, 236],
    [255, 169, 108], [227, 186, 70], [97, 130, 181], [166, 190, 216],
    [105, 188, 230], [70, 179, 176], [172, 217, 148], [171, 109, 70],
]

SIZES_1_10 = [4, 5, 6, 6, 8, 6, 7, 8, 9, 7]

# (起始关卡, 该阶段每 10 关的边长，按关卡号个位 1..9,0 排列)
SIZE_PHASES = [
    (11, [7, 8, 7, 8, 9, 8, 7, 9, 8, 10]),
    (51, [8, 9, 8, 10, 9, 8, 10, 9, 8, 10]),
    (201, [8, 9, 10, 9, 10, 8, 10, 9, 10, 10]),
    (2001, [8, 9, 10, 9, 10, 8, 9, 9, 10, 10]),
]

# (起始关卡, 该阶段每 10 关的 rank，个位 1..9,0；个位 0 且逢 20 的难关由 `rank_for_level` 改成 5)。
# 201 关起 10x10 约占一半；10x10 rank 3/4 的主线题池只有约 500 道，所以难度更多放在
# 题量充足的 9x9 rank 4 上（每 10 关 10x10 rank3 两道，2000 关内够用）。
# 2001 关起每 10 关仅取一道 10x10 rank3，其余难度由 8x8 rank3、9x9 rank4 承接，
# 保持原作主线题池规则，不回绕用空的题池，且不改变前 2000 关的游标与题目。
RANK_PHASES = [
    (21, [2, 2, 3, 2, 2, 3, 2, 3, 2, 4]),
    (51, [2, 3, 2, 3, 3, 2, 3, 3, 2, 4]),
    (201, [2, 3, 2, 4, 3, 3, 3, 4, 4, 4]),
    (2001, [3, 4, 2, 4, 3, 3, 4, 4, 4, 4]),
]
HARD_LEVEL_MIN = 51
HARD_LEVEL_PERIOD = 20
HARD_RANK = 5

MAIN_PATH_MIN_LEVEL = 51
LK_MOD_INTERVAL = 4
LK_MOD_RESERVED = {20, 30, 53, 71, 72, 75, 114, 141, 164}
SINGLE_REGION_LIMIT = 1

PREFILL_LEVEL_MAX = 10
TRANSFORM_COUNT = 8

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUTPUT = os.path.join(
    REPO_ROOT, "assets", "games", "meowdoku", "scripts", "MeowdokuLevels.ts"
)


def decrypt_bank(raw: bytes) -> bytes:
    key_len = len(BANK_XOR_KEY)
    return bytes(byte ^ BANK_XOR_KEY[i % key_len] for i, byte in enumerate(raw))


def extract_bank_files(xapk_path: str) -> dict[str, bytes]:
    """从 xapk/apk 里取出并解密 `assets/assets/resources/levels/*.json`。"""
    files: dict[str, bytes] = {}
    with zipfile.ZipFile(xapk_path) as archive:
        names = archive.namelist()
        base_name = next(
            (name for name in names if name.endswith(".apk") and "config" not in name),
            None,
        )
        if base_name is None:
            raise SystemExit(f"{xapk_path} 里找不到基础 apk")
        pack_name = next((name for name in names if name.startswith("assetPack")), None)
        if pack_name is None:
            raise SystemExit(f"{xapk_path} 里找不到 asset pack apk")
        import io

        with zipfile.ZipFile(io.BytesIO(archive.read(pack_name))) as pack:
            for name in pack.namelist():
                if not name.startswith("assets/assets/resources/levels/"):
                    continue
                if not name.endswith(".json"):
                    continue
                files[os.path.basename(name)] = decrypt_bank(pack.read(name))
    if not files:
        raise SystemExit("没有解出任何题库文件")
    return files


def load_bank_files(directory: str) -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    for name in os.listdir(directory):
        if not name.endswith(".json") or not name.startswith("bankData"):
            continue
        with open(os.path.join(directory, name), "rb") as handle:
            raw = handle.read()
        try:
            json.loads(raw)
            files[name] = raw
        except json.JSONDecodeError:
            files[name] = decrypt_bank(raw)
    return files


class Banks:
    def __init__(self, files: dict[str, bytes]) -> None:
        self._files = files
        self._cache: dict[str, object] = {}

    def _load(self, name: str):
        if name not in self._cache:
            raw = self._files.get(name)
            self._cache[name] = json.loads(raw) if raw else None
        return self._cache[name]

    def levels(self, size: int, rank: int) -> list:
        data = self._load(f"bankData{size}x{size}.json")
        return list(data.get(str(rank), [])) if isinstance(data, dict) else []

    def lk_style(self, size: int, rank: int) -> list:
        data = self._load(f"bankDataLKStyle{size}x{size}.json")
        return list(data.get(str(rank), [])) if isinstance(data, dict) else []

    def gc(self, size: int, rank: int) -> list:
        # GC 题库是 `{"levels": [...]}`，难度档在每道题的 `r` 字段里。
        data = self._load(f"bankDataGC{size}x{size}.json")
        levels = data.get("levels", []) if isinstance(data, dict) else []
        return [entry for entry in levels if int(entry.get("r", 0)) == rank]

    def lk_modified(self, size: int, rank: int, strict: bool) -> list:
        """原作 `LevelData.build_pools` 的 lk_mod 池：难关按 `r` 严格匹配，否则按 `maxR`。"""
        data = self._load("bankDataLKModified.json")
        levels = data.get("levels", []) if isinstance(data, dict) else []
        result = []
        for index, entry in enumerate(levels):
            if index + 1 in LK_MOD_RESERVED or int(entry.get("size", 0)) != size:
                continue
            entry_rank = int(entry.get("r", 1)) if strict else int(entry.get("maxR", entry.get("r", 1)))
            if entry_rank == rank:
                result.append(entry)
        return result


def phase_value(level: int, phases: list) -> int:
    table = None
    for start, values in phases:
        if level >= start:
            table = values
    if table is None:
        raise ValueError(f"第 {level} 关不在任何阶段里")
    return table[(level - 1) % 10]


def size_for_level(level: int) -> int:
    if level <= 10:
        return SIZES_1_10[level - 1]
    return phase_value(level, SIZE_PHASES)


def is_hard_level(level: int) -> bool:
    return level >= HARD_LEVEL_MIN and level % HARD_LEVEL_PERIOD == 0


def rank_for_level(level: int) -> int:
    if level <= 5:
        return 1
    if level <= 20:
        return 2
    if is_hard_level(level):
        return HARD_RANK
    return phase_value(level, RANK_PHASES)


def single_region_count(regions: list) -> int:
    counts = Counter(value for row in regions for value in row)
    return sum(1 for value in counts.values() if value == 1)


def compute_color_map(size: int, regions: list) -> list[int]:
    """原作 `LevelGenerator.compute_color_map`，用于自检；运行时由 TS 重算。"""
    adjacency: dict[int, set[int]] = {}
    for row in range(size):
        for col in range(size):
            current = regions[row][col]
            for other in (
                regions[row][col + 1] if col + 1 < size else None,
                regions[row + 1][col] if row + 1 < size else None,
            ):
                if other is None or other == current:
                    continue
                adjacency.setdefault(current, set()).add(other)
                adjacency.setdefault(other, set()).add(current)

    present = {value for row in regions for value in row}
    order = sorted(present, key=lambda rid: (-len(adjacency.get(rid, ())), rid))
    color_map: dict[int, int] = {}
    used: set[int] = set()
    for region_id in order:
        neighbor_slots = {color_map[n] for n in adjacency.get(region_id, ()) if n in color_map}
        best_slot, best_distance = 0, -1.0
        for slot in range(len(COLOR_MAP_RGB)):
            if slot in used:
                continue
            min_distance = math.inf
            for other in neighbor_slots:
                dr = COLOR_MAP_RGB[slot][0] - COLOR_MAP_RGB[other][0]
                dg = COLOR_MAP_RGB[slot][1] - COLOR_MAP_RGB[other][1]
                db = COLOR_MAP_RGB[slot][2] - COLOR_MAP_RGB[other][2]
                min_distance = min(min_distance, math.sqrt(dr * dr + dg * dg + db * db))
            if min_distance > best_distance:
                best_distance, best_slot = min_distance, slot
        color_map[region_id] = best_slot
        used.add(best_slot)
    return [color_map.get(index, 0) for index in range(size)]


def validate_solution(regions: list, solution: list) -> bool:
    size = len(regions)
    if len(solution) != size:
        return False
    cats = []
    for row in range(size):
        col = solution[row]
        if col < 0 or col >= size:
            return False
        cats.append((row, col))
    for i in range(size):
        for j in range(i + 1, size):
            a, b = cats[i], cats[j]
            if regions[a[0]][a[1]] == regions[b[0]][b[1]]:
                return False
            if a[0] == b[0] or a[1] == b[1]:
                return False
            if abs(a[0] - b[0]) <= 1 and abs(a[1] - b[1]) <= 1:
                return False
    return True


def compute_prefill(level: int, regions: list, solution: list) -> list[int] | None:
    """原作 `LevelData.compute_prefill`。"""
    if level < 1 or level > PREFILL_LEVEL_MAX:
        return None
    size = len(regions)
    want_size_one = level >= 7
    area = Counter(value for row in regions for value in row)
    for row in range(size):
        col = solution[row]
        region_area = area[regions[row][col]]
        if want_size_one and region_area == 1:
            return [row, col]
        if not want_size_one and region_area > 1:
            return [row, col]
    if size > 0 and solution:
        return [0, solution[0]]
    return None


TRANSFORMS = 8


def transform_grid(grid: list, transform: int) -> list:
    """8 种旋转/镜像：0..3 为旋转 0/90/180/270，4..7 为先水平镜像再旋转。"""
    size = len(grid)
    result = [row[::-1] for row in grid] if transform >= 4 else [row[:] for row in grid]
    for _ in range(transform % 4):
        result = [[result[size - 1 - c][r] for c in range(size)] for r in range(size)]
    return result


def normalize_regions(grid: list) -> tuple:
    labels: dict[int, int] = {}
    out = []
    for row in grid:
        for value in row:
            if value not in labels:
                labels[value] = len(labels)
            out.append(labels[value])
    return tuple(out)


def canonical_puzzle(regions: list) -> tuple:
    """题目的规范形：8 种变换下归一化颜色编号后取最小，旋转/镜像的同一道题结果相同。"""
    return (len(regions), min(normalize_regions(transform_grid(regions, t)) for t in range(TRANSFORMS)))


def tier_for(banks: Banks, size: int, rank: int) -> str:
    """原作 TierFallbackModifier：该档没有 N 题就不按 tier 筛。rank 1 不筛。"""
    if rank == 1:
        return ""
    has_normal = any(e.get("tier") == "N" for e in banks.levels(size, rank)) or any(
        e.get("tier") == "N" for e in banks.lk_style(size, rank)
    )
    return "N" if has_normal else ""


def build_pools(banks: Banks, size: int, rank: int, tier: str, main_path: bool):
    """原作 `LevelData.build_pools`：返回 (regular, lkstyle, gc) 三段主池。"""
    regular = banks.levels(size, rank)
    lk_style = banks.lk_style(size, rank)
    if tier:
        tiered_regular = [e for e in regular if e.get("tier", "") == tier]
        tiered_lk = [e for e in lk_style if e.get("tier", "") == tier]
        if tiered_regular or tiered_lk:
            regular, lk_style = tiered_regular, tiered_lk
    if main_path and size == 10 and rank in (3, 4):
        regular = []
    gc_levels = banks.gc(size, rank) if size == 10 and rank == 1 else []
    return [("regular", regular), ("lkstyle", lk_style), ("gc", gc_levels)]


def encode(value: int) -> str:
    if value < 0 or value >= len(ALPHABET):
        raise ValueError(f"无法用一位 36 进制表示 {value}")
    return ALPHABET[value]


class Cursor:
    """一个 (边长, rank, tier) 题池的取题进度。"""

    def __init__(self) -> None:
        self.legacy = 0
        self.main: int | None = None
        self.since_lk = 0


def generate(banks: Banks, count: int) -> tuple[list[dict], dict]:
    cursors: dict[tuple, Cursor] = {}
    lk_progress: dict[tuple, int] = {}
    seen: dict[tuple, int] = {}
    usage: dict[tuple, list[int]] = {}
    levels = []
    for level in range(1, count + 1):
        size = size_for_level(level)
        rank = rank_for_level(level)
        hard = is_hard_level(level)
        tier = "N" if hard else tier_for(banks, size, rank)
        main_path = level >= MAIN_PATH_MIN_LEVEL
        segments = build_pools(banks, size, rank, tier, main_path)
        main_total = sum(len(pool) for _, pool in segments)
        if main_total == 0:
            raise SystemExit(f"第 {level} 关：{size}x{size} rank {rank} 没有题池")
        key = (size, rank, tier)
        cursor = cursors.setdefault(key, Cursor())
        if main_path and cursor.main is None:
            # 原作 MainBankCursor._ensure_seeded：接着 legacy 进度往后取。
            denom = len(segments[0][1]) + len(segments[1][1])
            cursor.main = cursor.legacy % denom if cursor.legacy > 0 and denom > 0 else 0
        lk_key = (size, rank, hard)
        lk_pool = banks.lk_modified(size, rank, hard) if main_path else []

        chosen = None
        while chosen is None:
            use_lk = main_path and cursor.since_lk >= LK_MOD_INTERVAL and lk_progress.get(lk_key, 0) < len(lk_pool)
            if use_lk:
                lk_index = lk_progress.get(lk_key, 0)
                source, bank_index, entry = "lkmod", lk_index + 1, lk_pool[lk_index]
                lk_progress[lk_key] = lk_index + 1
                cursor.since_lk = 0
            else:
                index = cursor.main if main_path else cursor.legacy
                if index >= main_total:
                    raise SystemExit(
                        f"第 {level} 关：{size}x{size} rank {rank} tier '{tier}' 题池已取空（共 {main_total} 道），"
                        "请调整边长/难度曲线"
                    )
                offset = index
                for source, pool in segments:
                    if offset < len(pool):
                        bank_index, entry = offset + 1, pool[offset]
                        break
                    offset -= len(pool)
                if main_path:
                    cursor.main = index + 1
                    cursor.since_lk += 1
                else:
                    cursor.legacy = index + 1
            regions = [[int(v) for v in row] for row in entry["regionMap"]]
            solution = [int(v) for v in entry["solution"]]
            if len(regions) != size or any(len(row) != size for row in regions):
                continue
            if source != "lkmod" and single_region_count(regions) > SINGLE_REGION_LIMIT:
                continue
            if not validate_solution(regions, solution):
                continue
            puzzle = canonical_puzzle(regions)
            if puzzle in seen:
                continue
            seen[puzzle] = level
            chosen = (source, bank_index, entry, regions, solution)

        source, bank_index, entry, regions, solution = chosen
        stat = usage.setdefault((size, rank, tier, main_path), [0, main_total])
        stat[0] += 1
        levels.append({
            "level": level,
            "size": size,
            "rank": rank,
            "seed": int(entry.get("seed", entry.get("id", 0))),
            "source": source,
            "bankIndex": bank_index,
            "regions": regions,
            "solution": solution,
            "prefill": compute_prefill(level, regions, solution),
            "colorMap": compute_color_map(size, regions),
        })
    remaining = {
        key: (cursor.main if cursor.main is not None else cursor.legacy)
        for key, cursor in cursors.items()
    }
    return levels, {"usage": usage, "cursor": remaining}


HEADER = '''/**
 * Meowdoku 关卡序列（离线生成，运行时只读）。
 *
 * 题目取自原作题库，取题、筛题规则与原作默认组（NLControlStrategy）一致；边长与难度档
 * 是本项目固化的确定曲线（分阶段每 10 关一组，难关从第 51 关起每 20 关一次），
 * 整份序列内同一道题（含旋转/镜像）只出现一次。完整规则见生成脚本的说明。
 *
 * 数据使用 4 bit + Base64 无损存储，模块加载时还原为原有只读关卡接口。
 * `regions` 每行一个字符串，字符是 36 进制的颜色编号；`solution` 每一位是该行
 * 猫咪所在列；`prefill` 为 [行, 列]，null 表示不预置。颜色槽位由
 * `MeowdokuModel.computeMeowdokuColorMap` 在运行时按原作算法重算。
 *
 * 重新生成：`python3 project-scripts/meowdoku/build-level-bank.py --xapk <Meowdoku.xapk>`
 */

export interface MeowdokuLevelDefinition {
    /** 关卡号，从 1 开始。 */
    readonly level: number;
    /** 棋盘边长，猫咪数量与行数、列数、颜色数相同。 */
    readonly size: number;
    /** 题目难度档（1..5，5 为难关）。 */
    readonly rank: number;
    /** 原作题库里的种子 / 题号，仅用于问题追踪。 */
    readonly seed: number;
    /** 每格颜色编号，行优先；每个字符是 36 进制数字。 */
    readonly regions: readonly string[];
    /** 每行猫咪所在列；每个字符是 36 进制数字。 */
    readonly solution: string;
    /** 开局预置的猫咪位置 [行, 列]；null 表示不预置。 */
    readonly prefill: readonly [number, number] | null;
}

'''

DECODER = '''/**
 * 紧凑题库 v1：每关依次为 size:u8、rank:u8、seed:无符号 LEB128、
 * prefill:u8（行 * size + 列，255 表示无预置），随后是区域和答案的 4 bit 数值。
 * 区域按行展开后紧接答案，高半字节在先；关卡号由顺序恢复。
 * 使用纯 JS 解码，浏览器与微信小游戏均不依赖 atob / Buffer / wx。
 */
function decodeMeowdokuLevels(encoded: string, count: number): readonly MeowdokuLevelDefinition[] {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
        throw new Error('Invalid Meowdoku level bank Base64.');
    }
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
    const bytes = new Uint8Array(encoded.length / 4 * 3 - padding);
    let bits = 0;
    let value = 0;
    let output = 0;
    for (let i = 0; i < encoded.length - padding; i += 1) {
        value = (value << 6) | alphabet.indexOf(encoded[i]);
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes[output++] = (value >>> bits) & 255;
            value &= (1 << bits) - 1;
        }
    }
    let cursor = 0;
    const readByte = (): number => {
        if (cursor >= bytes.length) throw new Error('Truncated Meowdoku level bank.');
        return bytes[cursor++];
    };
    const levels: MeowdokuLevelDefinition[] = [];
    for (let index = 0; index < count; index += 1) {
        const size = readByte();
        const rank = readByte();
        if (size < 1 || size > 15 || rank < 1 || rank > 5) {
            throw new Error(`Invalid Meowdoku level ${index + 1} header.`);
        }
        // 不对 seed 做 32 位位移：原题库包含大于 2^31 - 1 的种子。
        let seed = 0;
        let factor = 1;
        let part: number;
        do {
            part = readByte();
            seed += (part & 127) * factor;
            if (seed > 0xffffffff || factor > 0x10000000) {
                throw new Error(`Invalid Meowdoku level ${index + 1} seed.`);
            }
            factor *= 128;
        } while (part & 128);
        const prefillIndex = readByte();
        if (prefillIndex !== 255 && prefillIndex >= size * size) {
            throw new Error(`Invalid Meowdoku level ${index + 1} prefill.`);
        }
        let digits = '';
        const digitCount = size * size + size;
        for (let i = 0; i < digitCount; i += 2) {
            const packed = readByte();
            const high = packed >>> 4;
            const low = packed & 15;
            if (high >= size || low >= size) {
                throw new Error(`Invalid Meowdoku level ${index + 1} digit.`);
            }
            digits += high.toString(36) + low.toString(36);
        }
        const regions: string[] = [];
        for (let row = 0; row < size; row += 1) {
            regions.push(digits.slice(row * size, (row + 1) * size));
        }
        const prefill: readonly [number, number] | null = prefillIndex === 255
            ? null : [Math.floor(prefillIndex / size), prefillIndex % size];
        levels.push({
            level: index + 1, size, rank, seed, regions,
            solution: digits.slice(size * size), prefill,
        });
    }
    if (cursor !== bytes.length) throw new Error('Unexpected trailing Meowdoku level bank data.');
    return Object.freeze(levels);
}
'''


def pack_levels(levels: list[dict]) -> bytes:
    """编码确定的关卡序列，不改变选题、配色编号、答案或预置。"""
    data = bytearray()
    for index, entry in enumerate(levels):
        size, rank, seed = entry["size"], entry["rank"], entry["seed"]
        if entry["level"] != index + 1:
            raise ValueError("关卡号必须从 1 连续递增")
        if not 1 <= size <= 15 or not 1 <= rank <= 5 or not 0 <= seed <= 0xffffffff:
            raise ValueError(f"关卡 {index + 1} 的头部超出紧凑格式范围")
        regions, solution = entry["regions"], entry["solution"]
        if len(regions) != size or any(len(row) != size for row in regions) or len(solution) != size:
            raise ValueError(f"关卡 {index + 1} 的棋盘或答案尺寸错误")
        digits = [v for row in regions for v in row] + list(solution)
        if any(not isinstance(v, int) or not 0 <= v < size for v in digits):
            raise ValueError(f"关卡 {index + 1} 的颜色或答案超出棋盘范围")
        prefill = entry["prefill"]
        if prefill is not None and (len(prefill) != 2 or any(not 0 <= v < size for v in prefill)):
            raise ValueError(f"关卡 {index + 1} 的预置位置错误")
        data.extend((size, rank))
        while seed >= 128:
            data.append((seed & 127) | 128)
            seed >>= 7
        data.append(seed)
        data.append(255 if prefill is None else prefill[0] * size + prefill[1])
        # size * (size + 1) 恒为偶数，无需半字节填充。
        data.extend((digits[i] << 4) | digits[i + 1] for i in range(0, len(digits), 2))
    return bytes(data)


def render(levels: list[dict]) -> str:
    encoded = base64.b64encode(pack_levels(levels)).decode("ascii")
    chunks = [encoded[i:i + 1024] for i in range(0, len(encoded), 1024)] or [""]
    payload = " +\n".join("    '" + chunk + "'" for chunk in chunks)
    return (HEADER + DECODER
            + "\nexport const MEOWDOKU_LEVELS: readonly MeowdokuLevelDefinition[] = decodeMeowdokuLevels(\n"
            + payload + f",\n    {len(levels)},\n);\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--xapk", help="Meowdoku 的 xapk 或 apk 路径")
    source.add_argument("--banks", help="已经解密的 bankData*.json 目录")
    parser.add_argument("--count", type=int, default=3000, help="生成多少关（默认 3000）")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="输出 TS 路径")
    parser.add_argument("--check", action="store_true", help="只校验现有输出是否一致")
    parser.add_argument("--report", action="store_true", help="打印逐关来源与预置信息")
    args = parser.parse_args()

    files = extract_bank_files(args.xapk) if args.xapk else load_bank_files(args.banks)
    banks = Banks(files)
    levels, stats = generate(banks, args.count)
    rendered = render(levels)

    if args.report:
        for entry in levels:
            print(
                "L%-4d %2dx%-2d rank=%d %-9s #%-4d prefill=%s colorMap=%s"
                % (
                    entry["level"], entry["size"], entry["size"], entry["rank"],
                    entry["source"], entry["bankIndex"],
                    entry["prefill"] or "-", entry["colorMap"],
                )
            )

    print(f"关卡数 {len(levels)}（整份序列内无重复题）")
    print("题池用量（边长, rank, tier, 第51关起）: 已交付 / 池大小")
    for key in sorted(stats["usage"]):
        used, total = stats["usage"][key]
        print("  %2dx%-2d r%d %-2s %-5s %5d / %5d" % (key[0], key[0], key[1], key[2] or "-", "main" if key[3] else "early", used, total))
    print("各题池游标（含被筛掉的题）:")
    for key in sorted(stats["cursor"]):
        print("  %2dx%-2d r%d %-2s -> %d" % (key[0], key[0], key[1], key[2] or "-", stats["cursor"][key]))

    if args.check:
        with open(args.output, "r", encoding="utf-8") as handle:
            current = handle.read()
        if current == rendered:
            print(f"{args.output} 与题库一致")
            return 0
        print(f"{args.output} 与题库不一致，请重新生成", file=sys.stderr)
        return 1

    with open(args.output, "w", encoding="utf-8") as handle:
        handle.write(rendered)
    print(f"已写入 {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
