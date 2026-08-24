import { ObjectPool } from '../../assets/games/endless-sword/scripts/core/ObjectPool';
import { RunModel } from '../../assets/games/endless-sword/scripts/core/RunModel';
import { SpatialHashGrid } from '../../assets/games/endless-sword/scripts/core/SpatialHashGrid';
import { CollisionSystem } from '../../assets/games/endless-sword/scripts/systems/CollisionSystem';
import { EnemySystem } from '../../assets/games/endless-sword/scripts/systems/EnemySystem';
import { ProjectileSystem } from '../../assets/games/endless-sword/scripts/systems/ProjectileSystem';
import { XpOrbSystem } from '../../assets/games/endless-sword/scripts/systems/XpOrbSystem';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function verifySpatialHashCellBoundaries(): void {
    const grid = new SpatialHashGrid<object>(128);
    const crossing = { id: 'crossing' };
    const negative = { id: 'negative' };
    const output: object[] = [];

    grid.insert(crossing, { minX: 127, minY: -2, maxX: 129, maxY: 2 });
    grid.query({ minX: 128, minY: -1, maxX: 130, maxY: 1 }, output);
    assert(output.length === 1 && output[0] === crossing,
        'Entity crossing the +128 cell boundary must be found exactly once.');

    grid.insert(negative, { minX: -129, minY: -2, maxX: -127, maxY: 2 });
    grid.query({ minX: -128, minY: -1, maxX: -126, maxY: 1 }, output);
    assert(output.indexOf(negative) >= 0,
        'Entity crossing the -128 cell boundary must be queryable from the adjacent cell.');

    grid.query({ minX: -256, minY: -16, maxX: 256, maxY: 16 }, output);
    assert(output.filter((item) => item === crossing).length === 1,
        'An entity occupying multiple cells must be deduplicated.');

    grid.clear();
    grid.query({ minX: -256, minY: -16, maxX: 256, maxY: 16 }, output);
    assert(Number(output.length) === 0, 'clear() must remove all query results.');
}

function verifyFixedObjectPool(): void {
    let factoryCalls = 0;
    const pool = new ObjectPool(2, (poolIndex) => {
        factoryCalls += 1;
        return { poolIndex, value: 0 };
    }, (item) => {
        item.value = 0;
    });
    assert(factoryCalls === 2, 'The pool must fully prewarm during construction.');
    const first = pool.acquire();
    const second = pool.acquire();
    assert(first && second, 'Prewarmed slots must be acquirable.');
    assert(pool.acquire() === undefined, 'An exhausted fixed pool must not allocate a new item.');
    first.value = 99;
    assert(pool.release(first), 'Active items must be releasable.');
    assert(!pool.release(first), 'Double release must be ignored.');
    const reused = pool.acquire();
    assert(reused === first && reused.value === 0,
        'Released slots must be reset and reused without another factory call.');
    assert(factoryCalls === 2, 'Acquire/release cycles must not invoke the factory.');
}

function verifyCollisionSettlementAndRecycling(): void {
    const enemies = new EnemySystem(4);
    const projectiles = new ProjectileSystem(4);
    const collision = new CollisionSystem();
    const player = new RunModel().player;
    player.x = 0;
    player.y = 200;

    const enemy = enemies.spawn('demon-rat', 128, 0);
    assert(enemy, 'Enemy pool must provide a slot.');
    projectiles.spawn('player', 109, 0, 0, 0, 0, 50, 1, 4, 4, 1);
    let killedCount = 0;
    collision.step(player, enemies, projectiles, () => {
        killedCount += 1;
    });
    assert(enemy.state === 'dying' && enemy.hp === 0,
        'Damage must settle death immediately even when the hit crosses a grid boundary.');
    assert(killedCount === 1, 'Death settlement callback must run immediately and exactly once.');
    assert(enemies.stats.active === 1,
        'The dying enemy keeps its prewarmed view slot only for the death presentation window.');

    enemies.step(0.23, player.x, player.y, () => undefined);
    enemies.flushRetired(() => undefined);
    projectiles.flushExpired(() => undefined);
    assert(Number(enemies.stats.active) === 0 && enemies.stats.available === 4,
        'Enemy must return to its pool after the 0.22 second presentation window.');
}

function verifyCrossbowAndXpPools(): void {
    const enemies = new EnemySystem(1);
    const crossbow = enemies.spawn('crossbow-puppet', 300, 0);
    assert(crossbow, 'Crossbow puppet must spawn from the enemy pool.');
    let shots = 0;
    let emittedSpeed = 0;
    let emittedDamage = 0;
    enemies.step(1.2, 0, 0, (_x, _y, _dx, _dy, speed, damage) => {
        shots += 1;
        emittedSpeed = speed;
        emittedDamage = damage;
    });
    assert(shots === 1 && emittedSpeed === 220 && emittedDamage === 12,
        'Crossbow puppet must use the configured 2.4s cadence, 220 speed and 12 damage shot.');

    const xp = new XpOrbSystem(2);
    assert(xp.spawn(0, 0, 3) && xp.spawn(1, 0, 6), 'XP pool must expose prewarmed slots.');
    assert(xp.spawn(2, 0, 9) === undefined, 'XP pool must respect its hard capacity.');
    xp.clear();
    assert(xp.stats.active === 0 && xp.stats.available === 2,
        'XP slots must all return on clear/restart.');
}

function verifyPlayerDamageDoesNotDisplace(): void {
    const contactEnemies = new EnemySystem(1);
    const contactProjectiles = new ProjectileSystem(1);
    const contactCollision = new CollisionSystem();
    const contactPlayer = new RunModel().player;
    contactPlayer.x = 37;
    contactPlayer.y = -19;
    assert(contactEnemies.spawn('demon-rat', 37, -19),
        'Contact regression setup must spawn an overlapping enemy.');

    contactCollision.step(
        contactPlayer,
        contactEnemies,
        contactProjectiles,
        () => undefined,
    );
    assert(contactPlayer.hp < 100,
        'Overlapping enemy contact must still damage the player.');
    assert(contactPlayer.x === 37 && contactPlayer.y === -19,
        'Enemy contact damage must never displace the player.');

    const rangedEnemies = new EnemySystem(1);
    const rangedProjectiles = new ProjectileSystem(1);
    const rangedCollision = new CollisionSystem();
    const rangedPlayer = new RunModel().player;
    rangedPlayer.x = -42;
    rangedPlayer.y = 58;
    assert(rangedProjectiles.spawn('enemy', -42, 58, 0, 0, 0, 12, 1, 28, 10, 1),
        'Projectile regression setup must spawn an enemy projectile.');

    rangedCollision.step(
        rangedPlayer,
        rangedEnemies,
        rangedProjectiles,
        () => undefined,
    );
    assert(rangedPlayer.hp === 88,
        'Overlapping enemy projectile must still apply its configured damage.');
    assert(rangedPlayer.x === -42 && rangedPlayer.y === 58,
        'Enemy projectile damage must never displace the player.');
}

verifySpatialHashCellBoundaries();
verifyFixedObjectPool();
verifyCollisionSettlementAndRecycling();
verifyCrossbowAndXpPools();
verifyPlayerDamageDoesNotDisplace();

// Keep output stable for CI and agent verification.
console.log('endless-sword core verification passed');
