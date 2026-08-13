const assert = require('assert');
const path = require('path');

const catalog = require(path.resolve(
    'temp/blade-defense-model/BladeDefenseCatalog.js',
));
const { BladeDefenseModel } = require(path.resolve(
    'temp/blade-defense-model/BladeDefenseModel.js',
));

function sequenceRandom(values, fallback = 0.99) {
    let index = 0;
    return () => index < values.length ? values[index++] : fallback;
}

function occupiedPets(model) {
    return model.snapshot.petSlots.filter(Boolean);
}

function killChest(model, rewardLevel = 1) {
    const chest = model.spawnChest({
        progress: 0,
        hp: 1,
        rewardLevel,
    });
    const events = model.tick(0.001);
    assert(
        events.some((event) => (
            event.type === 'entity-defeated' && event.entityId === chest.id
        )),
        `Chest ${chest.id} was not defeated by the outward-facing L1 blade.`,
    );
    return chest;
}

// Catalog: eight strictly improving levels, L1 damage 1 and both bonus odds.
{
    assert.deepStrictEqual(catalog.validateBladeDefenseCatalog(), []);
    assert.strictEqual(catalog.BLADE_DEFENSE_PET_LEVELS.length, 8);
    assert.strictEqual(catalog.getBladeDefensePetConfig(1).damage, 1);
    assert.strictEqual(catalog.getBladeDefensePetConfig(8).bladeCount, 8);
    assert.deepStrictEqual(
        catalog.getAvailableBladeDefenseBonusChoices(1).map((choice) => [
            choice.id,
            choice.levelDelta,
            choice.successChance,
        ]),
        [
            ['plus-2', 2, 0.55],
            ['plus-3', 3, 0.3],
        ],
    );
    assert.deepStrictEqual(
        catalog.getAvailableBladeDefenseBonusChoices(6).map((choice) => choice.id),
        ['plus-2'],
    );
    assert.deepStrictEqual(catalog.getAvailableBladeDefenseBonusChoices(7), []);
    for (let slot = 0; slot < catalog.BLADE_DEFENSE_RULES.petSlotCount; slot += 1) {
        const point = catalog.getBladeDefensePetSlotPosition(slot);
        assert(
            Math.hypot(point.x, point.y) < catalog.BLADE_DEFENSE_RULES.trackRadius,
            `Tower slot ${slot} must be inside the monster route.`,
        );
    }
}

// Initial round: 10 lives, 12 inner-ring slots and exactly one L1 pet.
{
    const model = new BladeDefenseModel(() => 0.99);
    const snapshot = model.snapshot;
    assert.strictEqual(snapshot.lives, 10);
    assert.strictEqual(snapshot.score, 0);
    assert.strictEqual(snapshot.state, 'running');
    assert.strictEqual(snapshot.petSlots.length, 12);
    assert.strictEqual(occupiedPets(model).length, 1);
    assert.strictEqual(snapshot.petSlots[0].level, 1);
    assert.strictEqual(snapshot.petSlots[0].damage, 1);
    assert.strictEqual(snapshot.petSlots[0].bladeCount, 1);
    assert(Object.isFrozen(snapshot));
    assert(Object.isFrozen(snapshot.petSlots));
    assert(Object.isFrozen(snapshot.petSlots[0].blades));
    const events = model.drainEvents();
    assert.deepStrictEqual(events.map((event) => event.type), ['round-reset']);
    assert(Object.isFrozen(events));
}

// Geometric hit and per-blade/per-target cooldown: the second overlapping tick
// cannot apply damage again even though the blade has barely moved.
{
    const model = new BladeDefenseModel(() => 0.99);
    model.drainEvents();
    const enemy = model.spawnEnemy({ progress: 0, hp: 3, speed: 0 });
    model.drainEvents();
    const firstTick = model.tick(0.001);
    assert.strictEqual(
        firstTick.filter((event) => event.type === 'entity-hit').length,
        1,
    );
    assert.strictEqual(model.snapshot.entities[0].hp, 2);
    const secondTick = model.tick(0.001);
    assert.strictEqual(
        secondTick.filter((event) => event.type === 'entity-hit').length,
        0,
    );
    assert.strictEqual(model.snapshot.entities[0].id, enemy.id);
    assert.strictEqual(model.snapshot.entities[0].hp, 2);
}

// Enemies advance on 0..1; reaching 1 removes them and damages base life.
{
    const model = new BladeDefenseModel(() => 0.99);
    const enemy = model.spawnEnemy({
        progress: 0.99,
        hp: 100,
        speed: 0.5,
        lifeDamage: 3,
    });
    const events = model.tick(0.03);
    assert.strictEqual(model.snapshot.lives, 7);
    assert(!model.snapshot.entities.some((entity) => entity.id === enemy.id));
    assert(events.some((event) => event.type === 'entity-escaped'));
    assert(events.some((event) => event.type === 'life-lost'));
}

// Ten leaked damage reaches game-over; later ticks cannot advance time.
{
    const model = new BladeDefenseModel(() => 0.99);
    model.spawnEnemy({
        progress: 0.99,
        hp: 100,
        speed: 0.5,
        lifeDamage: 10,
    });
    const events = model.tick(0.03);
    assert.strictEqual(model.snapshot.lives, 0);
    assert.strictEqual(model.snapshot.state, 'game-over');
    assert(events.some((event) => event.type === 'game-over'));
    const elapsed = model.snapshot.elapsedSeconds;
    assert.deepStrictEqual(model.tick(1), []);
    assert.strictEqual(model.snapshot.elapsedSeconds, elapsed);
    assert.strictEqual(model.startNextWave(), false);
}

// The first two defeated enemies guarantee onboarding drops; later drops use
// the configured random chance. All spawned chests are stationary/damageable.
{
    const model = new BladeDefenseModel(() => 0.99);
    for (let index = 0; index < 3; index += 1) {
        model.spawnEnemy({ progress: 0, hp: 1, speed: 0, wave: 1 });
        model.tick(0.001);
    }
    const chests = model.snapshot.entities.filter((entity) => entity.kind === 'chest');
    assert.strictEqual(chests.length, 2);
    chests.forEach((chest) => {
        assert.strictEqual(chest.speed, 0);
        assert.strictEqual(chest.progress, 0);
    });
}

// Destroying a chest awards a pet directly into an empty tower slot.
{
    const model = new BladeDefenseModel(() => 0.99);
    killChest(model, 2);
    const pets = occupiedPets(model);
    assert.strictEqual(pets.length, 2);
    assert.strictEqual(model.snapshot.petSlots[1].level, 2);
    assert.strictEqual(model.snapshot.score, catalog.BLADE_DEFENSE_RULES.chestScore);
    assert(model.drainEvents().some((event) => (
        event.type === 'pet-awarded'
        && event.level === 2
        && event.queued === false
        && event.slotIndex === 1
    )));
}

// Empty-slot move preserves pet identity/phase. Different levels swap and
// preserve both phases; same levels are delegated to mergePets by the UI.
{
    const model = new BladeDefenseModel(() => 0.99);
    const initial = model.snapshot.petSlots[0];
    const moved = model.movePet(0, 5);
    assert.strictEqual(moved.outcome, 'moved');
    assert.strictEqual(model.snapshot.petSlots[0], null);
    assert.strictEqual(model.snapshot.petSlots[5].id, initial.id);
    assert.strictEqual(model.snapshot.petSlots[5].rotation, initial.rotation);

    const swapModel = new BladeDefenseModel(() => 0.99);
    killChest(swapModel, 2);
    const first = swapModel.snapshot.petSlots[0];
    const second = swapModel.snapshot.petSlots[1];
    const swapped = swapModel.movePet(0, 1);
    assert.strictEqual(swapped.outcome, 'swapped');
    assert.strictEqual(swapModel.snapshot.petSlots[1].id, first.id);
    assert.strictEqual(swapModel.snapshot.petSlots[1].rotation, first.rotation);
    assert.strictEqual(swapModel.snapshot.petSlots[0].id, second.id);
    assert.strictEqual(swapModel.snapshot.petSlots[0].rotation, second.rotation);

    const sameModel = new BladeDefenseModel(() => 0.99);
    killChest(sameModel, 1);
    assert.deepStrictEqual(sameModel.movePet(0, 1), {
        outcome: 'rejected',
        reason: 'same-level-target',
    });
}

// Normal drag-merge consumes firstSlot (source) and upgrades the existing pet
// in secondSlot (target), preserving the target identity and attack phase.
{
    const model = new BladeDefenseModel(() => 0.99);
    killChest(model, 1);
    const source = model.snapshot.petSlots[0];
    const target = model.snapshot.petSlots[1];
    const result = model.mergePets(0, 1);
    assert.strictEqual(result.outcome, 'merged');
    assert.strictEqual(result.resultLevel, 2);
    assert.strictEqual(model.snapshot.petSlots[0], null);
    assert.strictEqual(model.snapshot.petSlots[1].id, target.id);
    assert.strictEqual(model.snapshot.petSlots[1].level, 2);
    assert.strictEqual(model.snapshot.petSlots[1].rotation, target.rotation);
    assert.notStrictEqual(model.snapshot.petSlots[1].id, source.id);
}

// A 30% offer exposes +2 at 55% and +3 at 30%; a successful +2 goes to L3.
{
    const model = new BladeDefenseModel(sequenceRandom([0.1, 0.54]));
    killChest(model, 1);
    const targetId = model.snapshot.petSlots[1].id;
    const merge = model.mergePets(0, 1);
    assert.strictEqual(merge.outcome, 'bonus-offered');
    assert.deepStrictEqual(
        merge.offer.choices.map((choice) => [choice.id, choice.successChance]),
        [['plus-2', 0.55], ['plus-3', 0.3]],
    );
    const resolution = model.resolveBonusOffer('plus-2');
    assert.strictEqual(resolution.outcome, 'bonus-success');
    assert.strictEqual(resolution.resultLevel, 3);
    assert.strictEqual(model.snapshot.petSlots[0], null);
    assert.strictEqual(model.snapshot.petSlots[1].id, targetId);
    assert.strictEqual(model.snapshot.petSlots[1].level, 3);
}

// A failed +3 consumes only the dragged source and keeps exactly the original
// target pet, level and attack phase.
{
    const model = new BladeDefenseModel(sequenceRandom([0.1, 0.3]));
    killChest(model, 1);
    const source = model.snapshot.petSlots[0];
    const target = model.snapshot.petSlots[1];
    const merge = model.mergePets(0, 1);
    assert.strictEqual(merge.outcome, 'bonus-offered');
    const resolution = model.resolveBonusOffer('plus-3');
    assert.strictEqual(resolution.outcome, 'bonus-failed');
    assert.strictEqual(resolution.resultLevel, 1);
    assert.strictEqual(model.snapshot.petSlots[0], null);
    assert.strictEqual(model.snapshot.petSlots[1].id, target.id);
    assert.strictEqual(model.snapshot.petSlots[1].level, 1);
    assert.strictEqual(model.snapshot.petSlots[1].rotation, target.rotation);
    assert.notStrictEqual(model.snapshot.petSlots[1].id, source.id);
    assert.strictEqual(occupiedPets(model).length, 1);
}

// Declining a Bonus performs the stable +1 merge without another RNG roll.
{
    const model = new BladeDefenseModel(sequenceRandom([0.1]));
    killChest(model, 1);
    const targetId = model.snapshot.petSlots[1].id;
    assert.strictEqual(model.mergePets(0, 1).outcome, 'bonus-offered');
    const resolution = model.resolveBonusOffer('safe');
    assert.strictEqual(resolution.outcome, 'safe-merge');
    assert.strictEqual(resolution.resultLevel, 2);
    assert.strictEqual(model.snapshot.petSlots[0], null);
    assert.strictEqual(model.snapshot.petSlots[1].id, targetId);
    assert.strictEqual(model.snapshot.petSlots[1].level, 2);
}

// All 12 slots are actual deployed towers. Extra chest rewards queue, then a
// UI claim fills a newly freed slot after a merge.
{
    const model = new BladeDefenseModel(() => 0.99);
    for (let index = 0; index < 11; index += 1) killChest(model, 2);
    assert.strictEqual(occupiedPets(model).length, 12);
    killChest(model, 3);
    assert.deepStrictEqual(model.snapshot.pendingPetLevels, [3]);
    assert(model.drainEvents().some((event) => (
        event.type === 'pet-awarded' && event.queued === true
    )));
    const merged = model.mergePets(1, 2);
    assert.strictEqual(merged.outcome, 'merged');
    assert.strictEqual(model.snapshot.petSlots[1], null);
    const claimed = model.claimPendingPets();
    assert.strictEqual(claimed.length, 1);
    assert.strictEqual(claimed[0].slotIndex, 1);
    assert.strictEqual(claimed[0].level, 3);
    assert.deepStrictEqual(model.snapshot.pendingPetLevels, []);
    assert.strictEqual(occupiedPets(model).length, 12);
}

// Wave 1 uses the base count, spawns one enemy immediately, then schedules the
// rest at a fixed cadence. A second wave cannot overlap the active one.
{
    const model = new BladeDefenseModel(() => 0.99);
    assert.strictEqual(model.startNextWave(), true);
    assert.strictEqual(model.snapshot.wave.number, 1);
    assert.strictEqual(
        model.snapshot.wave.totalEnemies,
        catalog.BLADE_DEFENSE_RULES.baseWaveEnemyCount,
    );
    assert.strictEqual(model.snapshot.wave.spawnedEnemies, 1);
    const firstWaveEnemy = model.snapshot.entities.find((entity) => entity.kind === 'enemy');
    assert(firstWaveEnemy);
    assert.strictEqual(firstWaveEnemy.hp, catalog.BLADE_DEFENSE_RULES.baseEnemyHp);
    assert.strictEqual(firstWaveEnemy.speed, catalog.BLADE_DEFENSE_RULES.baseEnemySpeed);
    assert.strictEqual(firstWaveEnemy.scoreValue, catalog.BLADE_DEFENSE_RULES.baseEnemyScore);
    assert.strictEqual(
        model.snapshot.wave.enemiesWaitingToSpawn,
        catalog.BLADE_DEFENSE_RULES.baseWaveEnemyCount - 1,
    );
    assert.strictEqual(model.startNextWave(), false);
    model.tick(catalog.BLADE_DEFENSE_RULES.waveSpawnIntervalSeconds + 0.01);
    assert.strictEqual(model.snapshot.wave.spawnedEnemies, 2);
    const completionEvents = [];
    for (let index = 0; index < 4 && model.snapshot.wave.active; index += 1) {
        completionEvents.push(...model.tick(10));
    }
    assert.strictEqual(model.snapshot.wave.active, false);
    assert(completionEvents.some((event) => event.type === 'wave-completed'));
    assert(
        model.snapshot.score
            >= catalog.BLADE_DEFENSE_RULES.waveClearScorePerWave,
    );
    assert.strictEqual(model.startNextWave(), true);
    assert.strictEqual(model.snapshot.wave.number, 2);
    assert.strictEqual(
        model.snapshot.wave.totalEnemies,
        catalog.BLADE_DEFENSE_RULES.baseWaveEnemyCount
            + catalog.BLADE_DEFENSE_RULES.enemiesAddedPerWave,
    );
    const secondWaveEnemy = model.snapshot.entities.find((entity) => entity.kind === 'enemy');
    assert(secondWaveEnemy);
    assert.strictEqual(
        secondWaveEnemy.hp,
        catalog.BLADE_DEFENSE_RULES.baseEnemyHp
            + catalog.BLADE_DEFENSE_RULES.enemyHpPerWave,
    );
    assert.strictEqual(
        secondWaveEnemy.speed,
        catalog.BLADE_DEFENSE_RULES.baseEnemySpeed
            + catalog.BLADE_DEFENSE_RULES.enemySpeedPerWave,
    );
}

console.log(
    'blade_defense_model=passed, levels=8, slots=12, '
    + 'geometry=passed, cooldown=passed, waves=passed, wave_scaling=passed, early_drop_pity=passed, chest_queue=passed, '
    + 'move_swap=passed, merge_target=passed, bonus_safe_success_failure=passed, '
    + 'gameover=passed',
);
