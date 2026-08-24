import {
    ACTIVE_SKILL_IDS,
    getActiveSkillConfig,
    getSkillLevelConfig,
    type ActiveSkillId,
} from '../config/SkillConfig';
import {
    getPassiveLevelConfig,
    getPassiveSkillConfig,
    PASSIVE_SKILL_IDS,
    type PassiveSkillId,
} from '../config/PassiveSkillConfig';
import { SeededRandom } from '../core/SeededRandom';

export type UpgradeOptionKind = 'active-skill' | 'passive-skill' | 'spring';

export interface UpgradeOption {
    readonly id: string;
    readonly kind: UpgradeOptionKind;
    readonly targetId?: ActiveSkillId | PassiveSkillId;
    readonly displayName: string;
    readonly currentLevel: number;
    readonly nextLevel: number;
    readonly description: string;
    readonly effectText: string;
    readonly evolutionHint?: string;
    readonly iconRect?: Readonly<{
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    }>;
    readonly iconKind: 'active' | 'passive' | 'pickup' | 'none';
}

export interface UpgradeBuildState {
    readonly activeLevels: Readonly<Record<ActiveSkillId, number>>;
    readonly passiveLevels: Readonly<Record<PassiveSkillId, number>>;
    readonly hp: number;
    readonly maxHp: number;
}

type UpgradeCategory = 'active-upgrade' | 'active-new' | 'passive-upgrade' | 'passive-new' | 'spring';

interface WeightedCategory {
    readonly kind: UpgradeCategory;
    weight: number;
}

const MAX_LEVEL = 5;
const ACTIVE_UPGRADE_WEIGHT = 36;
const NEW_ACTIVE_WEIGHT = 18;
const PASSIVE_UPGRADE_WEIGHT = 28;
const NEW_PASSIVE_WEIGHT = 13;
const SPRING_WEIGHT = 5;

/**
 * T1.7 升级选项生成器。它只消费配置和当前 Build，不持有节点，
 * 因而同一 runSeed 下的选项顺序可以稳定复现。
 */
export class UpgradeSystem {
    private random = new SeededRandom(1);
    private refreshesRemaining = 2;

    reset(seed: number): void {
        this.random = new SeededRandom((seed ^ 0x51f15e77) >>> 0);
        this.refreshesRemaining = 2;
    }

    get remainingRefreshes(): number {
        return this.refreshesRemaining;
    }

    refresh(state: UpgradeBuildState): UpgradeOption[] | undefined {
        if (this.refreshesRemaining <= 0) {
            return undefined;
        }
        this.refreshesRemaining -= 1;
        return this.createOptions(state);
    }

    createOptions(state: UpgradeBuildState): UpgradeOption[] {
        const activeUpgrade = ACTIVE_SKILL_IDS.filter((id) => {
            const level = state.activeLevels[id] ?? 0;
            return level > 0 && level < MAX_LEVEL;
        });
        const newActive = ACTIVE_SKILL_IDS.filter((id) => (state.activeLevels[id] ?? 0) <= 0);
        const passiveUpgrade = PASSIVE_SKILL_IDS.filter((id) => {
            const level = state.passiveLevels[id] ?? 0;
            return level > 0 && level < MAX_LEVEL;
        });
        const newPassive = PASSIVE_SKILL_IDS.filter((id) => (state.passiveLevels[id] ?? 0) <= 0);
        const canUseSpring = state.maxHp > 0 && state.hp / state.maxHp < 0.45;

        const categories: WeightedCategory[] = [];
        if (activeUpgrade.length > 0) {
            categories.push({ kind: 'active-upgrade', weight: ACTIVE_UPGRADE_WEIGHT });
        }
        if (newActive.length > 0) {
            categories.push({ kind: 'active-new', weight: NEW_ACTIVE_WEIGHT });
        }
        if (passiveUpgrade.length > 0) {
            categories.push({ kind: 'passive-upgrade', weight: PASSIVE_UPGRADE_WEIGHT });
        }
        if (newPassive.length > 0) {
            categories.push({ kind: 'passive-new', weight: NEW_PASSIVE_WEIGHT });
        }
        if (canUseSpring) {
            categories.push({ kind: 'spring', weight: SPRING_WEIGHT });
        } else if (activeUpgrade.length > 0) {
            // 灵泉不在池中时，它的 5% 权重并入已拥有主动技能升级。
            const activeCategory = categories.find((category) => category.kind === 'active-upgrade');
            if (activeCategory) {
                activeCategory.weight += SPRING_WEIGHT;
            }
        }

        const selected = new Set<string>();
        const options: UpgradeOption[] = [];
        const maxOptions = Math.min(3, this.countAvailableOptions(activeUpgrade, newActive, passiveUpgrade, newPassive, canUseSpring));
        let guard = 0;
        while (options.length < maxOptions && guard < 48) {
            guard += 1;
            const category = this.pickCategory(categories);
            const option = this.pickOption(category, activeUpgrade, newActive, passiveUpgrade, newPassive, state, canUseSpring, selected);
            if (!option || selected.has(option.id)) {
                continue;
            }
            selected.add(option.id);
            options.push(option);
        }

        // 极端情况下（只剩一种升级）仍保持升级事件可消费，不产生空面板。
        if (options.length === 0) {
            options.push(this.createFallbackOption(state));
        }
        return options;
    }

    private pickCategory(categories: readonly WeightedCategory[]): UpgradeCategory {
        const total = categories.reduce((sum, category) => sum + category.weight, 0);
        if (total <= 0) {
            return 'spring';
        }
        let cursor = this.random.range(0, total);
        for (const category of categories) {
            cursor -= category.weight;
            if (cursor <= 0) {
                return category.kind;
            }
        }
        return categories[categories.length - 1].kind;
    }

    private pickOption(
        category: UpgradeCategory,
        activeUpgrade: readonly ActiveSkillId[],
        newActive: readonly ActiveSkillId[],
        passiveUpgrade: readonly PassiveSkillId[],
        newPassive: readonly PassiveSkillId[],
        state: UpgradeBuildState,
        canUseSpring: boolean,
        selected: ReadonlySet<string>,
    ): UpgradeOption | undefined {
        if (category === 'spring') {
            return canUseSpring && !selected.has('spring') ? createSpringOption() : undefined;
        }

        if (category === 'active-upgrade' || category === 'active-new') {
            const candidates = (category === 'active-upgrade' ? activeUpgrade : newActive)
                .filter((id) => !selected.has(`active:${id}`));
            if (candidates.length === 0) {
                return undefined;
            }
            const id = candidates[this.random.int(0, candidates.length - 1)];
            return createActiveOption(id, state.activeLevels[id] ?? 0);
        }

        const candidates = (category === 'passive-upgrade' ? passiveUpgrade : newPassive)
            .filter((id) => !selected.has(`passive:${id}`));
        if (candidates.length === 0) {
            return undefined;
        }
        const id = candidates[this.random.int(0, candidates.length - 1)];
        return createPassiveOption(id, state.passiveLevels[id] ?? 0);
    }

    private countAvailableOptions(
        activeUpgrade: readonly ActiveSkillId[],
        newActive: readonly ActiveSkillId[],
        passiveUpgrade: readonly PassiveSkillId[],
        newPassive: readonly PassiveSkillId[],
        canUseSpring: boolean,
    ): number {
        return new Set([
            ...activeUpgrade.map((id) => `active:${id}`),
            ...newActive.map((id) => `active:${id}`),
            ...passiveUpgrade.map((id) => `passive:${id}`),
            ...newPassive.map((id) => `passive:${id}`),
            ...(canUseSpring ? ['spring'] : []),
        ]).size;
    }

    private createFallbackOption(state: UpgradeBuildState): UpgradeOption {
        const active = ACTIVE_SKILL_IDS.find((id) => (state.activeLevels[id] ?? 0) < MAX_LEVEL);
        if (active) {
            return createActiveOption(active, state.activeLevels[active] ?? 0);
        }
        const passive = PASSIVE_SKILL_IDS.find((id) => (state.passiveLevels[id] ?? 0) < MAX_LEVEL);
        if (passive) {
            return createPassiveOption(passive, state.passiveLevels[passive] ?? 0);
        }
        return createSpringOption();
    }
}

function createActiveOption(id: ActiveSkillId, currentLevel: number): UpgradeOption {
    const definition = getActiveSkillConfig(id);
    const nextLevel = Math.min(MAX_LEVEL, currentLevel + 1);
    const current = currentLevel > 0 ? getSkillLevelConfig(id, currentLevel) : undefined;
    const next = getSkillLevelConfig(id, nextLevel);
    const delta = current
        ? `伤害 ${current.damage} → ${next.damage}`
            + (current.cooldownSeconds !== next.cooldownSeconds
                ? `，冷却 ${current.cooldownSeconds.toFixed(2)}s → ${next.cooldownSeconds.toFixed(2)}s`
                : '')
        : `解锁后造成 ${next.damage} 点伤害`;
    const quantityText = current && current.quantity !== next.quantity
        ? `，数量 ${current.quantity} → ${next.quantity}`
        : '';
    return Object.freeze({
        id: `active:${id}`,
        kind: 'active-skill',
        targetId: id,
        displayName: definition.displayName,
        currentLevel,
        nextLevel,
        description: '主动技能',
        effectText: `${delta}${quantityText}`,
        iconRect: definition.iconRect,
        iconKind: 'active',
    });
}

function createPassiveOption(id: PassiveSkillId, currentLevel: number): UpgradeOption {
    const definition = getPassiveSkillConfig(id);
    const nextLevel = Math.min(MAX_LEVEL, currentLevel + 1);
    const next = getPassiveLevelConfig(id, nextLevel);
    return Object.freeze({
        id: `passive:${id}`,
        kind: 'passive-skill',
        targetId: id,
        displayName: definition.displayName,
        currentLevel,
        nextLevel,
        description: '心法',
        effectText: getPassiveEffectText(id, next),
        iconRect: definition.iconRect,
        iconKind: 'passive',
    });
}

function createSpringOption(): UpgradeOption {
    return Object.freeze({
        id: 'spring',
        kind: 'spring',
        displayName: '灵泉',
        currentLevel: 0,
        nextLevel: 0,
        description: '灵泉',
        effectText: '恢复最大生命 35%',
        iconKind: 'pickup',
    });
}

function getPassiveEffectText(id: PassiveSkillId, level: ReturnType<typeof getPassiveLevelConfig>): string {
    switch (id) {
        case 'sword-heart':
            return `所有伤害 +${Math.round((level.damageMultiplier - 1) * 100)}%`;
        case 'wind-control':
            return `移速 +${Math.round((level.moveSpeedMultiplier - 1) * 100)}%，急速 +${level.haste}`;
        case 'spirit-sense':
            return `暴击率 +${Math.round(level.critChance * 100)}%，暴击伤害 +${Math.round(level.critDamage * 100)}%`;
        case 'domain':
            return `技能范围 +${Math.round((level.rangeMultiplier - 1) * 100)}%`;
    }
}
