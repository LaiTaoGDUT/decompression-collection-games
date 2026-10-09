'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const creatorRoot = process.env.COCOS_CREATOR_ROOT || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked';
const ts = require(path.join(creatorRoot, 'node_modules/typescript'));
const scripts = path.join(root, 'assets/games/doodle-jump/scripts');
require.extensions['.ts'] = (module, filename) => {
    const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        fileName: filename,
        compilerOptions: {target: ts.ScriptTarget.ES2015, module: ts.ModuleKind.CommonJS},
    });
    module._compile(result.outputText, filename);
};
const {parseDoodleJumpGameplayConfig} = require(path.join(scripts, 'DoodleJumpConfig.ts'));
const {DoodleJumpSimulation} = require(path.join(scripts, 'DoodleJumpSimulation.ts'));
const {DoodleJumpRandomStreams} = require(path.join(scripts, 'DoodleJumpRandom.ts'));
const {DoodleJumpLevelGenerator} = require(path.join(scripts, 'DoodleJumpLevelGenerator.ts'));
const rules = require(path.join(scripts, 'DoodleJumpReferenceRules.ts'));
const source = JSON.parse(fs.readFileSync(path.join(root, 'assets/games/doodle-jump/configs/gameplay.json'), 'utf8'));
const config = parseDoodleJumpGameplayConfig(source);
const quiet = parseDoodleJumpGameplayConfig({...source,
    enemies:{...source.enemies,enabled:false},hazards:{...source.hazards,enabled:false},items:{...source.items,enabled:false},
});
function near(actual, expected, label, tolerance = 1e-7) {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}
let y = 0, velocity = config.player.bounceVelocity, peak = 0, peakFrame = 0;
for (let frame = 1; frame <= 100; frame++) {
    const step = rules.stepDoodleJumpVertical(velocity, config.player.gravity, 1/60, config.player.terminalFallVelocity);
    y += step.displacement;velocity = step.velocity;
    if (y > peak) {peak = y;peakFrame = frame;}
}
near(peak, 406.125, '60 Hz ordinary jump peak');
assert.equal(peakFrame, 38);
near(velocity, -1265.625, 'terminal falling velocity');
assert.ok(rules.stepDoodleJumpVertical(1740,-2025,1/60,-1265.625).velocity > 1265.625, 'boosts must not be capped at the ordinary bounce speed');
const twoFrames = rules.stepDoodleJumpVertical(1265.625,-2025,1/30,-1265.625);
near(twoFrames.displacement, (9+8.76)*750/320, 'native fractional-frame displacement');
assert.equal(rules.referencePlatformGap(60000,0,0),25);
assert.equal(rules.referencePlatformGap(60000,0,0.99),90);
assert.equal(rules.referencePlatformGap(60000,2,0.99),50);
assert.equal(rules.referenceMonsterChance(3000),0);
assert.equal(rules.referenceMonsterChance(3330),0.6);
assert.equal(rules.referenceMonsterChance(30000),0.1);
near(rules.reflectedPlatformX(100,60,1,320),160,'linear mover');
near(rules.reflectedPlatformX(290,60,1,320),234,'reflected mover');
// Run the live simulation, with platforms below the ascending player, not just the helper.
const physics = new DoodleJumpSimulation({...quiet,generation:{...quiet.generation,enabled:false}},11);
physics.restore({...physics.getSnapshot(), playerY:1000, maxAbsoluteWorldY:1000});
for (let index=0;index<38;index++) physics.advance(1/60,0,1334);
let state=physics.getSnapshot();
near(state.playerY,1406.125,'live jump peak');
near(state.cameraBottomY,1405.84375-726.5625,'camera stops before the first descending frame');
const cameraPeak=state.cameraBottomY;
for (let index=0;index<10;index++) physics.advance(1/60,0,1334);
near(physics.getSnapshot().cameraBottomY,cameraPeak,'camera never retreats with descent');
// Render rate must not alter the fixed simulation sequence.
const rateStates=[];
for (const rate of [30,60,120]) {
    const sim=new DoodleJumpSimulation(quiet,33);
    for (let frame=0;frame<rate;frame++) sim.advance(1/rate,0.4,1334);
    rateStates.push(sim.getSnapshot());
}
assert.deepEqual(rateStates[0],rateStates[1]);assert.deepEqual(rateStates[1],rateStates[2]);
let generatedCount=0, degradedCount=0;
const patternIds=new Set();
const platformTypes=new Set();
for (let seed=1;seed<=30;seed++) {
    const sim=new DoodleJumpSimulation(quiet,seed);
    for (let climb=0;climb<=120000;climb+=180) {
        // Advance the camera to exercise the actual incremental generation and
        // recycling code over 1,200 m, without conflating player skill with reachability.
        sim.items.grantShield(10);
        sim.cameraBottomY=climb;sim.playerY=climb+quiet.camera.anchorHeight-100;
        sim.velocityY=quiet.player.bounceVelocity;sim.velocityX=0;
        sim.advance(1/60,0,1334);
        const snapshot=sim.getSnapshot();
        assert.ok(snapshot.platforms.length<=100);
        assert.ok(Math.max(...snapshot.platforms.map(p=>p.baseY))>=climb+1334+quiet.generation.preloadAboveScreen);
        snapshot.platforms.forEach(p=>{platformTypes.add(p.type);if(p.spawnPlan?.patternId!==undefined)patternIds.add(p.spawnPlan.patternId);});
        const solid=snapshot.platforms.filter(p=>p.mainRoute).sort((a,b)=>a.baseY-b.baseY);
        for(let index=1;index<solid.length;index++) assert.ok(solid[index].baseY-solid[index-1].baseY<406.125,'continuous ordinary-jump route');
    }
    const end=sim.getSnapshot();generatedCount+=end.generatorCursor;degradedCount+=end.degradedGenerationCount;
}
assert.equal(patternIds.size,3);
assert.equal(platformTypes.size,8);
// Pending segment rows and random cursors survive a mid-segment save.
const streamA=new DoodleJumpRandomStreams(456), streamB=new DoodleJumpRandomStreams(456);
const generatorA=new DoodleJumpLevelGenerator(config,streamA),generatorB=new DoodleJumpLevelGenerator(config,streamB);
let previousY=15000;
for(let i=0;i<5;i++)previousY=generatorA.next(previousY,10000).y;
generatorB.restore(generatorA.getSnapshot());streamB.restore(streamA.getSnapshot());
for(let i=0;i<100;i++) {
    const a=generatorA.next(previousY,10000),b=generatorB.next(previousY,10000);
    assert.deepEqual(a,b);previousY=a.y;
}
const segments=new Map();
for(let i=0;i<1500;i++){
    const row=generatorA.next(previousY,20000);previousY=row.y;
    if(row.spawnPlan.content){
        const key=`${row.spawnPlan.segmentId}:${row.spawnPlan.content}`;
        assert.ok(!segments.has(key),'one content ticket per category per segment');segments.set(key,true);
    }
}
for(const kind of ['enemy','hazard','item'])assert.ok(Array.from(segments.keys()).some(k=>k.endsWith(':'+kind)));
// Live snapshot restore reproduces subsequent platforms and motion.
const original=new DoodleJumpSimulation(quiet,77);
for(let i=0;i<120;i++) original.advance(1/60,0,1334);
const restored=new DoodleJumpSimulation(quiet,77);restored.restore(original.getSnapshot());
for(let i=0;i<120;i++){original.advance(1/60,0,1334);restored.advance(1/60,0,1334);}
assert.deepEqual(restored.getSnapshot(),original.getSnapshot());
console.log(JSON.stringify({checks:'passed',jumpPeak:peak,peakFrame,renderRates:[30,60,120],generationSeeds:30,maximumClimbMeters:1200,generatedPlatforms:generatedCount,degradedRecoveries:degradedCount,patterns:Array.from(patternIds).sort((a,b)=>a-b),platformTypes:Array.from(platformTypes).sort(),contentTickets:segments.size}));
