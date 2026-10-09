import type { DoodleJumpGameplayConfig, DoodleJumpPlatformType } from './DoodleJumpConfig';
import { DoodleJumpRandomStreams } from './DoodleJumpRandom';
import {
    DOODLE_JUMP_REFERENCE_PATTERNS,
    DOODLE_JUMP_REFERENCE_WIDTH,
    referenceMonsterChance,
    referenceMonsterClearance,
    referenceMovingSpeed,
    referencePlatformGap,
    type DoodleJumpGenerationState,
    type DoodleJumpPlannedPlatform,
    type DoodleJumpSegmentContent,
} from './DoodleJumpReferenceRules';

/** A segment owns its content tickets; individual platforms never roll spawns. */
export class DoodleJumpLevelGenerator {
    private segmentId = 0;
    private previousRawType = 0;
    private previousHadMonster = false;
    private readonly pending: DoodleJumpPlannedPlatform[] = [];

    constructor(
        private readonly config: DoodleJumpGameplayConfig,
        private readonly random: DoodleJumpRandomStreams,
    ) {}

    reset(): void {
        this.segmentId = 0;
        this.previousRawType = 0;
        this.previousHadMonster = false;
        this.pending.length = 0;
    }

    getSnapshot(): DoodleJumpGenerationState {
        return Object.freeze({
            segmentId: this.segmentId,
            previousRawType: this.previousRawType,
            previousHadMonster: this.previousHadMonster,
            pending: Object.freeze(this.pending.map((entry) => Object.freeze({
                ...entry, spawnPlan: Object.freeze({ ...entry.spawnPlan }),
            }))),
        });
    }

    restore(state: DoodleJumpGenerationState): void {
        if (!state || !Number.isInteger(state.segmentId) || state.segmentId < 0
            || !Number.isInteger(state.previousRawType) || typeof state.previousHadMonster !== 'boolean'
            || !Array.isArray(state.pending)
            || state.pending.length > 15) throw new Error('Invalid level-generator state.');
        let lastY = -Infinity;
        state.pending.forEach((entry) => {
            if (!Number.isFinite(entry.x) || !Number.isFinite(entry.y) || entry.y <= lastY
                || !entry.spawnPlan || entry.spawnPlan.segmentId !== state.segmentId
                || ['normal', 'moving', 'breakable', 'disappearing', 'shifting', 'exploding', 'vertical-moving', 'spiked'].indexOf(entry.type) < 0
                || (entry.movingVelocity !== undefined && !Number.isFinite(entry.movingVelocity))
                || (entry.spawnPlan.content !== undefined
                    && ['enemy', 'hazard', 'item'].indexOf(entry.spawnPlan.content) < 0)) {
                throw new Error('Invalid pending level segment.');
            }
            lastY = entry.y;
        });
        this.segmentId = state.segmentId;
        this.previousRawType = state.previousRawType;
        this.previousHadMonster = state.previousHadMonster;
        this.pending.length = 0;
        state.pending.forEach((entry) => this.pending.push(Object.freeze({
            ...entry, spawnPlan: Object.freeze({ ...entry.spawnPlan }),
        })));
    }

    next(previousY: number, climbY: number): DoodleJumpPlannedPlatform {
        const scale = this.config.design.width / DOODLE_JUMP_REFERENCE_WIDTH;
        const height = Math.max(0, climbY / scale);
        if (this.pending.length === 0) this.prepareSegment(previousY, height, scale);
        const entry = this.pending.shift()!;
        this.previousRawType = entry.rawType;
        this.previousHadMonster = entry.spawnPlan.content === 'enemy';
        return entry;
    }

    private prepareSegment(previousY: number, height: number, scale: number): void {
        this.segmentId += 1;
        const settings = this.config.generation;
        // Pattern selection frequency is an adaptation; only the bank's geometry
        // and previous-type baseline adjustments have direct native evidence.
        const authored = settings.platformTypeOverride === 'auto' && height > 3500
            && this.random.next('platform') < settings.authoredPatternChance;
        if (authored) {
            const pattern = DOODLE_JUMP_REFERENCE_PATTERNS[
                Math.floor(this.random.next('platform') * DOODLE_JUMP_REFERENCE_PATTERNS.length)
            ];
            const extra = this.previousRawType === 2 ? 60 : this.previousRawType === 3 ? 20 : 0;
            const baseline = previousY + (10 + extra) * scale;
            pattern.entries.forEach(([rawType, x, dy]) => this.pending.push(Object.freeze({
                x: x * scale,
                y: baseline + dy * scale,
                rawType,
                type: this.platformType(rawType),
                movingVelocity: rawType === 1 ? referenceMovingSpeed(height, this.random.next('platform')) * 60 * scale : undefined,
                spawnPlan: Object.freeze({ segmentId: this.segmentId, patternId: pattern.id }),
            })));
            return;
        }

        let y = previousY;
        let previousRawType = this.previousRawType;
        const width = this.config.platformBehavior.standardWidth / scale;
        for (let index = 0; index < 12; index += 1) {
            let rawType = height > 2500 && this.random.next('platform') * 100 < height / 400 ? 1 : 0;
            if (previousRawType !== 2 && this.random.next('platform') < 0.2) rawType = 2;
            y += referencePlatformGap(height, previousRawType, this.random.next('platform')) * scale;
            this.pending.push({
                x: (Math.floor(this.random.next('platform') * (320 - Math.floor(width))) + Math.floor(width / 2)) * scale,
                y,
                type: this.platformType(rawType),
                rawType,
                movingVelocity: rawType === 1 ? referenceMovingSpeed(height, this.random.next('platform')) * 60 * scale : undefined,
                spawnPlan: { segmentId: this.segmentId },
            });
            previousRawType = rawType;
        }

        // Preserve paper-jump's special behaviours in explicit optional slots.
        // Their native type mappings are unresolved; these odds are adaptations,
        // and must not change the reference random gap or ordinary moving rule.
        const heightMeters = height * scale / 100;
        if (heightMeters >= this.config.platformBehavior.challenge.startHeightMeters
            && this.random.next('platform') < settings.specialPlatformChancePerSegment) {
            const choices: DoodleJumpPlatformType[] = ['shifting', 'exploding'];
            if (heightMeters >= this.config.platformBehavior.verticalMoving.unlockHeightMeters) choices.push('vertical-moving');
            if (heightMeters >= this.config.platformBehavior.spiked.unlockHeightMeters) choices.push('spiked');
            const eligible = this.pending.map((entry, index) => ({ entry, index }))
                .filter(({ entry, index }) => index > 1 && index < 10 && entry.type === 'normal');
            if (eligible.length > 0) {
                const index = eligible[Math.floor(this.random.next('platform') * eligible.length)].index;
                this.pending[index] = { ...this.pending[index],
                    type: choices[Math.floor(this.random.next('platform') * choices.length)],
                    spawnPlan: { segmentId: this.segmentId, paperSpecial: true },
                };
            }
        }

        const available = this.pending.map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => entry.type === 'normal' || entry.type === 'moving')
            .map(({ index }) => index);
        const reserve = (content: DoodleJumpSegmentContent): void => {
            if (available.length === 0) return;
            const slot = Math.floor(this.random.next(content === 'item' ? 'item' : 'enemy') * available.length);
            const index = available.splice(slot, 1)[0];
            const entry = this.pending[index];
            this.pending[index] = Object.freeze({ ...entry,
                spawnPlan: Object.freeze({ segmentId: this.segmentId, content }),
            });
        };
        if (this.config.enemies.enabled && this.random.next('enemy') < referenceMonsterChance(height)) reserve('enemy');
        if (this.config.hazards.enabled && height * scale / 100 >= Math.min(
            this.config.hazards.bearTrap.unlockHeightMeters,
            this.config.hazards.blackHole.unlockHeightMeters,
            this.config.hazards.ufo.unlockHeightMeters,
        ) && this.random.next('enemy') < settings.hazardChancePerSegment) reserve('hazard');
        if (this.config.items.enabled && this.random.next('item') < settings.itemChancePerSegment) reserve('item');

        let clearance = this.previousHadMonster
            ? referenceMonsterClearance(height, this.random.next('platform')) * scale : 0;
        for (let index = 0; index < this.pending.length; index += 1) {
            const entry = this.pending[index];
            if (index > 0 && this.pending[index - 1].spawnPlan.content === 'enemy') {
                clearance += referenceMonsterClearance(height, this.random.next('platform')) * scale;
            }
            this.pending[index] = Object.freeze({ ...entry, y: entry.y + clearance });
        }
    }

    private platformType(rawType: number): DoodleJumpPlatformType {
        return rawType === 1 ? 'moving' : rawType === 2 ? 'breakable'
            : rawType === 3 ? 'disappearing' : 'normal';
    }
}
