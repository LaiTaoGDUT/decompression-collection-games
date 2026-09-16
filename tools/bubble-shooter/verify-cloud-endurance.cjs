// Deterministic coarse-aim player exercises real turn transitions, not hand-set victories.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), os=require('node:os');
const {execFileSync}=require('node:child_process');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-endurance-'));
try {
    execFileSync('tsc',['assets/games/bubble-shooter/scripts/BubbleShooterRound.ts','--module','commonjs','--target','es2020','--outDir',out,'--skipLibCheck']);
    const {BubbleShooterRound}=require(path.join(out,'BubbleShooterRound.js'));
    const {BubbleShooterModel,COLUMNS,MAX_ROW}=require(path.join(out,'BubbleShooterModel.js'));
    let totalShots=0,wins=0,failures=0,revives=0; const stages={ordinary:[],boss:[]};
    for(let run=1;run<=12;run++) {
        let seed=run*7919; const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
        const r=new BubbleShooterRound(random);r.reset();let stageShots=0;
        for(let turn=0;turn<700;turn++) {
            const copy=new BubbleShooterRound();assert(copy.restore(r.snapshot()),'Every committed state is recoverable: '+JSON.stringify(r.snapshot()));
            assert.deepEqual(copy.snapshot(),r.snapshot());
            if(r.stage==='boss-entry'){stages.ordinary.push(stageShots);stageShots=0;r.beginBoss();continue;}
            if(r.stage==='victory') {
                stages.boss.push(stageShots);stageShots=0;wins++;
                const item=['bomb','wildcard','clear-bottom'].find(k=>r.inventory[k]<3);
                assert(r.claimReward(item));assert(!r.claimReward(item));assert(r.continueCloud());
                if(r.completedRegions>=8)break;
                continue;
            }
            if(r.ended){failures++;if(r.canRevive){assert(r.revive());revives++;continue;}break;}
            r.refreshStale();
            let best;
            for(let angle=-70;angle<=70;angle+=7) {
                const a=angle*Math.PI/180,shot=r.board.trace({x:Math.sin(a),y:Math.cos(a)});if(!shot)continue;
                for(const swap of [false,true]) {
                    const color=swap?r.next:r.current;
                    const model=new BubbleShooterModel();model.reset(r.board.bubbles,r.board.rowPhase);
                    const result=model.settle(shot.cell,color);
                    const value=(result.removed.length+result.dropped.length)*5+result.thawed.length*2-shot.cell.row*.015;
                    if(!best||value>best.value)best={value,swap,shot};
                }
            }
            assert(best,'A stable board always has a legal shot');
            if(best.swap)r.swap();r.settle(best.shot.cell);stageShots++;totalShots++;
            assert(r.bossHealth>=0&&r.bossHealth<=60);assert(r.board.bubbles.length<=COLUMNS*(MAX_ROW+1));
        }
    }
    let blindFailures=0,blindRevives=0;
    for(let run=1;run<=6;run++) {
        let seed=run*193;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
        const r=new BubbleShooterRound(random);r.reset();
        for(let t=0;t<200;t++) {
            assert(new BubbleShooterRound().restore(r.snapshot()),'Unassisted failure/transition saves also restore');
            if(r.stage==='boss-entry'){r.beginBoss();continue;}
            if(r.stage==='victory'){r.claimReward(['bomb','wildcard','clear-bottom'].find(k=>r.inventory[k]<3));r.continueCloud();continue;}
            if(r.ended){blindFailures++;if(r.canRevive){assert(r.revive());blindRevives++;continue;}break;}
            r.refreshStale();const angles=Array.from({length:21},(_,i)=>(-70+i*7)*Math.PI/180);
            const shots=angles.map(a=>r.board.trace({x:Math.sin(a),y:Math.cos(a)})).filter(Boolean);
            assert(shots.length);r.settle(shots[Math.floor(random()*shots.length)].cell);
        }
    }
    assert(blindFailures>=6&&blindRevives===6,'Poor aim exercises one revive then terminal failure');
    assert(wins>=12,'Aimed play should be able to reach and defeat the cloud Boss repeatedly');
    assert(totalShots>500);
    const median=xs=>xs.slice().sort((a,b)=>a-b)[Math.floor(xs.length/2)];
    console.log(JSON.stringify({runs:12,totalShots,wins,failures,revives,blindRuns:6,blindFailures,blindRevives,medianOrdinaryShots:median(stages.ordinary),medianBossShots:median(stages.boss)}));
}finally{fs.rmSync(out,{recursive:true,force:true});}
