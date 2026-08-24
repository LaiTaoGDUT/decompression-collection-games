import { ENDLESS_SWORD_CONFIG } from '../config/GameConfig';
import {
    PASSIVE_SKILL_IDS,
    getPassiveLevelConfig,
    type PassiveSkillId,
} from '../config/PassiveSkillConfig';

/** 玩家单局可变状态（策划案 §10）。prev* 供渲染插值使用。 */
export interface PlayerModel {
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    moveDirX: number;
    moveDirY: number;
    moveMagnitude: number;
    facingX: number;
    facingY: number;
    hp: number;
    invincibilityRemaining: number;
}

/**
 * 单局可变状态（策划案 §4/§5）。系统只写 Model，视图只读 Model；
 * 游戏状态机（RunState）由入口组件持有，本类不重复。
 */
export class RunModel {
    runSeed = 0;
    gameplayElapsedTime = 0;
    combatScore = 0;
    kills = 0;
    level = 1;
    xp = 0;
    readonly passiveLevels: Record<PassiveSkillId, number> = createPassiveLevels();
    readonly player: PlayerModel = createPlayer();

    reset(seed: number): void {
        this.runSeed = seed;
        this.gameplayElapsedTime = 0;
        this.combatScore = 0;
        this.kills = 0;
        this.level = 1;
        this.xp = 0;
        for (const id of PASSIVE_SKILL_IDS) {
            this.passiveLevels[id] = 0;
        }
        const player = this.player;
        player.x = 0;
        player.y = 0;
        player.prevX = 0;
        player.prevY = 0;
        player.moveDirX = 0;
        player.moveDirY = 0;
        player.moveMagnitude = 0;
        player.facingX = 0;
        player.facingY = -1;
        player.hp = ENDLESS_SWORD_CONFIG.player.maxHp;
        player.invincibilityRemaining = 0;
    }

    /** 每个逻辑步开始前记录上一帧位置，供渲染插值。 */
    beginLogicStep(): void {
        const player = this.player;
        player.prevX = player.x;
        player.prevY = player.y;
    }

    /** 渲染插值位置：alpha ∈ [0,1)。 */
    lerpPlayer(alpha: number): { x: number; y: number } {
        const player = this.player;
        return {
            x: player.prevX + (player.x - player.prevX) * alpha,
            y: player.prevY + (player.y - player.prevY) * alpha,
        };
    }

    get survivalScore(): number {
        return Math.floor(this.gameplayElapsedTime * ENDLESS_SWORD_CONFIG.survivalScorePerSecond);
    }

    get totalScore(): number {
        return this.survivalScore + this.combatScore;
    }

    get xpToNext(): number {
        return getXpToNextLevel(this.level);
    }

    get xpProgress(): number {
        return Math.max(0, Math.min(1, this.xp / this.xpToNext));
    }

    addExperience(value: number): number {
        if (!Number.isFinite(value) || value <= 0) {
            return 0;
        }
        this.xp += Math.floor(value);
        let levelUps = 0;
        while (this.xp >= this.xpToNext) {
            this.xp -= this.xpToNext;
            this.level += 1;
            levelUps += 1;
        }
        return levelUps;
    }

    get damageMultiplier(): number {
        const level = this.passiveLevels['sword-heart'];
        return level > 0 ? getPassiveLevelConfig('sword-heart', level).damageMultiplier : 1;
    }

    get moveSpeedMultiplier(): number {
        const level = this.passiveLevels['wind-control'];
        return level > 0 ? getPassiveLevelConfig('wind-control', level).moveSpeedMultiplier : 1;
    }

    get cooldownMultiplier(): number {
        const level = this.passiveLevels['wind-control'];
        if (level <= 0) {
            return 1;
        }
        const haste = getPassiveLevelConfig('wind-control', level).haste;
        return 100 / (100 + haste);
    }

    get rangeMultiplier(): number {
        const level = this.passiveLevels.domain;
        return level > 0 ? getPassiveLevelConfig('domain', level).rangeMultiplier : 1;
    }

    get critChance(): number {
        const level = this.passiveLevels['spirit-sense'];
        return level > 0 ? getPassiveLevelConfig('spirit-sense', level).critChance : 0;
    }

    get critDamage(): number {
        const level = this.passiveLevels['spirit-sense'];
        return level > 0 ? getPassiveLevelConfig('spirit-sense', level).critDamage : 0;
    }
}

export function getXpToNextLevel(level: number): number {
    const safeLevel = Math.max(1, Math.floor(level));
    return Math.floor(18 + 8 * safeLevel + 0.65 * safeLevel * safeLevel);
}

function createPlayer(): PlayerModel {
    return {
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        moveDirX: 0,
        moveDirY: 0,
        moveMagnitude: 0,
        facingX: 0,
        facingY: -1,
        hp: ENDLESS_SWORD_CONFIG.player.maxHp,
        invincibilityRemaining: 0,
    };
}

function createPassiveLevels(): Record<PassiveSkillId, number> {
    return {
        'sword-heart': 0,
        'wind-control': 0,
        'spirit-sense': 0,
        domain: 0,
    };
}
