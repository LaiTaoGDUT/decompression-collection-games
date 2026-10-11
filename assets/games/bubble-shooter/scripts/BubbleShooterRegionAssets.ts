import { PACKED_SPRITE_PATHS } from './PackedSpritePaths';
import { SpriteAtlas, SpriteFrame } from 'cc';
import type { AudioService } from '../../../services/audio/AudioService';
import type { AssetService } from '../../../services/asset/AssetService';
import { BUBBLE_SCENE_SPRITES } from './BubbleShooterSceneBindings';
import type { BubbleRegion } from './BubbleShooterRound';
import { bubbleAudioEntries } from './BubbleShooterAudioCatalog';
import type { BubbleShooterAudioSlot, CloudCue } from './BubbleShooterAudio';

export const CAMPAIGN_ICONS = ['campaign', 'endless', 'clear', 'target', 'anchor', 'boss', 'shots', 'lock', 'back', 'retry', 'star', 'play'] as const;
export type CampaignIcon = typeof CAMPAIGN_ICONS[number];
/** Home, level map, detail popup and level HUD chrome from one campaign UI atlas. */
export const CAMPAIGN_UI = ['logo', 'mode-campaign', 'mode-endless', 'node-cloud', 'node-ocean', 'node-toy', 'node-magic', 'node-done', 'node-locked', 'node-boss',
    'pointer', 'star-empty', 'halo', 'back', 'next', 'close', 'badge', 'medallion', 'check', 'banner', 'chip', 'hud-pill', 'ribbon-gold', 'ribbon-mint',
    'start-cloud', 'start-ocean', 'start-toy', 'start-magic'] as const;
export type CampaignUiFrame = typeof CAMPAIGN_UI[number];

/** Page and HUD artwork stays in this game's asset bundle and is owned by the session. */
export async function loadBubbleCampaignArtwork(assets: AssetService) {
    const bundle = await assets.prepareBundle('game-bubble-shooter-assets', 'visual/common/campaign', undefined, { excludeAudio: true });
    const atlas = bundle.get('visual/common/campaign/ui-icons-v1', SpriteAtlas);
    const icons = {} as Record<CampaignIcon, SpriteFrame>;
    for (const name of CAMPAIGN_ICONS) {
        const frame = atlas?.getSpriteFrame(name);
        if (!frame) throw new Error('Missing campaign icon: ' + name);
        icons[name] = frame;
    }
    const uiAtlas = bundle.get('visual/common/campaign/campaign-ui-v2', SpriteAtlas);
    const ui = {} as Record<CampaignUiFrame, SpriteFrame>;
    for (const name of CAMPAIGN_UI) {
        const frame = uiAtlas?.getSpriteFrame(name);
        if (!frame) throw new Error('Missing campaign UI frame: ' + name);
        ui[name] = frame;
    }
    const panel = bundle.get('visual/common/campaign/popup-panel-v2/spriteFrame', SpriteFrame);
    if (!panel) throw new Error('Missing campaign popup panel');
    // Menu previews need only these four textures, not the four gameplay/audio packs.
    // Acquire them atomically so an import failure cannot leave partial runtime frames.
    const frames = await assets.loadSpriteFrames('game-bubble-shooter-assets', [
        { key: 'cloud', path: 'visual/regions/cloud/backgrounds/background/spriteFrame' },
        { key: 'ocean', path: 'visual/regions/ocean/backgrounds/background/spriteFrame' },
        { key: 'toy', path: 'visual/regions/toy/backgrounds/workshop-v5/texture', type: 'texture' },
        { key: 'magic', path: 'visual/regions/magic/backgrounds/quiet-v4/texture', type: 'texture' },
        { key: 'homeHero', path: 'visual/common/campaign/home-cover-v4/texture', type: 'texture' },
    ]);
    const backgrounds: Record<BubbleRegion, SpriteFrame> = { cloud: frames.cloud, ocean: frames.ocean, toy: frames.toy, magic: frames.magic };
    return { icons, ui, panel, backgrounds, homeHero: frames.homeHero };
}
export type BubbleCampaignArtwork = Awaited<ReturnType<typeof loadBubbleCampaignArtwork>>;

export function releaseBubbleCampaignArtwork(assets: AssetService, artwork: BubbleCampaignArtwork): void {
    for (const region of ['cloud', 'ocean', 'toy', 'magic'] as const) assets.releaseRuntimeAsset(artwork.backgrounds[region]);
    assets.releaseRuntimeAsset(artwork.homeHero);
}

const OCEAN_REPLACEMENTS: Readonly<Record<string,string>> = {
    'backgrounds/background':'backgrounds/background',
    'backgrounds/cloud-transition':'backgrounds/reef',
    'launcher/launcher-head':'launcher/turret',
    'launcher/launcher-turret':'launcher/turret',
    'launcher/launcher-pedestal':'launcher/base',
    'launcher/swap-icon':'hud/swap',
    'hud/hud-pause-button':'hud/pause',
    'hud/hud-down-arrow':'hud/down',
    'hud/hud-frosting-skill':'hud/skill-petrify',
    'reward-cloud/reward-cloud-title':'reward/celebration',
    'vfx/attack-energy-heart':'vfx/attack-pearl-v1',
};

/** 公共资源在启动游戏场景前已准备好；云幕不依赖任何主题目录。 */
export async function loadBubbleTransitionAssets(assets: AssetService) {
    const bundle = await assets.prepareBundle('game-bubble-shooter-assets', 'visual/common', undefined, { excludeAudio: true });
    const get = (path: string): SpriteFrame => {
        const frame = bundle.get(PACKED_SPRITE_PATHS[`visual/common/${path}/spriteFrame`] ?? `visual/common/${path}/spriteFrame`, SpriteFrame);
        if (!frame) throw new Error(`Missing transition SpriteFrame: ${path}`);
        return frame;
    };
    return { cloud: get('transition/cloud-curtain'), banner: get('transition/boss-alert'), button: get('reward-common/reward-button') };
}

/** A validated set of frames acquired exclusively through the session AssetService. */
export async function loadBubbleRegion(assets: AssetService, region: BubbleRegion,
    audio: Pick<AudioService, 'isMusicEnabled' | 'isSoundEnabled' | 'decodePackedAudio'>) {
    await assets.prepareBundle('game-bubble-shooter-assets','visual/common', undefined, { excludeAudio: true });
    const bundle=await assets.prepareBundle('game-bubble-shooter-assets',`visual/regions/${region}`, undefined, { excludeAudio: true });
    const get=(path:string):SpriteFrame=>{
        const frame=bundle.get(PACKED_SPRITE_PATHS[`${path}/spriteFrame`] ?? `${path}/spriteFrame`,SpriteFrame);
        if(!frame)throw new Error(`Missing ${region} SpriteFrame: ${path}`);
        return frame;
    };
    get('visual/common/hud/round-panel');
    const rulesPath=`visual/regions/${region}/hud/rules-icon-v2/rules`;
    const rulesIcon=bundle.get(PACKED_SPRITE_PATHS[rulesPath] ?? rulesPath,SpriteFrame);
    if(!rulesIcon)throw new Error(`Missing ${region} rules HUD icon`);
    const scoreAtlas=bundle.get('visual/common/hud/score-icons-v1',SpriteAtlas);
    const scoreIcons=['score','best'].map(name=>{
        const frame=scoreAtlas?.getSpriteFrame(name);
        if(!frame)throw new Error('Missing score HUD icon '+name);
        return frame;
    });
    const regional=(path:string):SpriteFrame=>{
        if(region==='toy'||region==='magic'){
            const color=path.match(/^bubbles\/bubble-(red|yellow|blue|purple)$/)?.[1];
            if(color)return part(region==='magic'?'bubbles/solid-v9':'bubbles/crafted-v5',color);
            if(path==='backgrounds/background')return part(region==='toy'?'backgrounds/workshop-v5':'backgrounds/quiet-v4','background');
        }
        return get(`visual/regions/${region}/${path}`);
    };
    const part=(atlas:string,name:string):SpriteFrame=>{
        const path=`visual/regions/${region}/${atlas}/${name}`;
        const packed=PACKED_SPRITE_PATHS[path];
        const sheet=packed?undefined:bundle.get(`visual/regions/${region}/${atlas}`,SpriteAtlas);
        const frame=packed?bundle.get(packed,SpriteFrame):sheet?.getSpriteFrame(name);
        if(!frame)throw new Error(`Missing ${region} atlas part: ${atlas}/${name}`);
        return frame;
    };
    const comboFrames=[6,7,8,9,10].map(tier=>{
        const frame=bundle.get(PACKED_SPRITE_PATHS[`visual/common/combo/banner-${tier}/banner`],SpriteFrame);
        if(!frame)throw new Error('Missing common combo banner '+tier);
        return frame;
    });
    // 每个区域只需公共包和当前主题包；音乐仍按原路径独立加载。
    const [commonAudio, regionalAudio] = audio.isSoundEnabled ? await Promise.all(
        ['common', region].map(name => assets.loadPackedAudio('game-bubble-shooter-assets',
            `audio-banks/${name}`, data => audio.decodePackedAudio(data)))) : [];
    const comboAudioSlots: BubbleShooterAudioSlot[] = (audio.isSoundEnabled ? [6,7,8,9,10] : []).map(tier => ({
        cue: ('combo-'+tier) as CloudCue,
        clips: [], packedClips: [commonAudio!.effect(`visual/common/combo/combo-${tier}`)],
        volume: .65,
    }));
    const modalAtlas=region==='toy'?'modal/boss-panel-v7':region==='magic'?'modal/boss-panel-v8':'modal/boss-panel-v2';
    const modalFrames = {top: part(modalAtlas,'top'), middle: part(modalAtlas,'middle'), bottom: part(modalAtlas,'bottom')};
    const bossAlert=region==='cloud'?get('visual/common/transition/boss-alert'):part(region==='toy'?'transition/alert-v7':region==='magic'?'transition/alert-v8':'transition/alert-v5','alert');
    // Validate critical assets before a transition commits gameplay/reward state.
    ['bubbles/bubble-red','bubbles/bubble-yellow','bubbles/bubble-blue','bubbles/bubble-purple','bubbles/bubble-support','backgrounds/background'].forEach(regional);
    if(region==='ocean') ['backgrounds/reef','vfx/attack-pearl-v1','launcher/turret','launcher/base','hud/health-track','hud/health-fill','hud/pause','hud/down','hud/swap','hud/item-base',
        'boss/boss-reclining-body','boss/boss-reclining-staff','boss/boss-reclining-arm','hud/skill-petrify','reward/celebration',
        'decoration/fish','decoration/seaweed','foreground/water-bubble-single'].forEach(regional);
    if(region==='toy'||region==='magic') {
        (region==='toy'?['body','left-arm','right-arm','projectile']:['left-arm','right-arm','ornament','projectile']).forEach(n=>part(region==='toy'?'boss/bear-v7':'boss/rig-v4',n));
        ['turret','base','swap','down','pause','item'].forEach(n=>part('launcher/controls-v2',n));
        ['red','yellow','blue','purple'].forEach(c=>[1,2].forEach(i=>part('vfx/pop-v2',`${c}-${i}`)));
        part(region==='toy'?'backgrounds/canopy-v7':'backgrounds/canopy-v3','canopy');part(region==='magic'?'reward/celebration-v8':'reward/celebration-v7','celebration');
        if(region==='toy'){part('board/rail-v2','rail');['turret','base'].forEach(n=>part('launcher/airplane-v3',n));}
        if(region==='magic'){part('boss/core-v7','core');['flyer','drift'].forEach(n=>part('decoration/ambient-v3',n));}
        else part('decoration/cotton-v7','cotton');
    }
    const audioSlots: BubbleShooterAudioSlot[] = await Promise.all(bubbleAudioEntries(region)
        .filter(({cue}) => cue.endsWith('-music')
            ? audio.isMusicEnabled : audio.isSoundEnabled)
        .map(async ({cue,paths,volume,startSeconds = 0}) => {
            if (cue.endsWith('-music')) return {
                cue, volume, startSeconds, clips: await Promise.all(paths.map(path =>
                    assets.loadAudioClip('game-bubble-shooter-assets', path))),
            };
            return { cue, volume, startSeconds, clips: [], packedClips: paths.map(path =>
                (path.startsWith('visual/common/') ? commonAudio! : regionalAudio!).effect(path)) };
        }));
    const pack = {region,regional,part,scoreIcons,rulesIcon,audioSlots,comboFrames,comboAudioSlots,bossAlert,modalFrames,sceneFrame(path:string):SpriteFrame|null {
        if(region==='ocean' && path==='visual/common/items/item-button-base')return regional('hud/item-base');
        if((region==='toy'||region==='magic') && path==='visual/common/items/item-button-base')return part('launcher/controls-v2','item');
        if(path.startsWith('visual/common/'))return get(path);
        const local=path.replace('visual/regions/cloud/','');
        if(region==='cloud')return regional(local);
        if(local.startsWith('bubbles/') && local!=='bubbles/frosting-overlay')return regional(local);
        if(region==='toy'||region==='magic') {
            if(local==='backgrounds/background')return regional(local);
            if(local==='backgrounds/cloud-transition')return part(region==='toy'?'backgrounds/canopy-v7':'backgrounds/canopy-v3','canopy');
            if(local==='boss/boss-pudding-body')return region==='toy'?part('boss/bear-v7','body'):part('boss/core-v7','core');
            if(local==='launcher/launcher-pedestal')return part(region==='toy'?'launcher/airplane-v3':'launcher/controls-v2','base');
            if(local==='launcher/swap-icon')return part('launcher/controls-v2','swap');
            if(local==='hud/hud-down-arrow')return part('launcher/controls-v2','down');
            if(local==='hud/hud-pause-button')return part('launcher/controls-v2','pause');
            if(local==='hud/hud-frosting-skill')return part(region==='toy'?'boss/bear-v7':'boss/rig-v4','projectile');
            if(local==='reward-cloud/reward-cloud-title')return part(region==='magic'?'reward/celebration-v8':'reward/celebration-v7','celebration');
            if(local==='launcher/launcher-head'||local==='launcher/launcher-turret')return part(region==='toy'?'launcher/airplane-v3':'launcher/controls-v2','turret');
            if(local==='vfx/attack-energy-heart')return part(region==='toy'?'boss/bear-v7':'boss/rig-v4','projectile');
            if(local.startsWith('vfx/attack-candy-shards/'))return part('vfx/pop-v2',local.split('/')[2].replace('-0','-'));
            return null;
        }
        if(local.startsWith('vfx/attack-candy-shards/'))return regional(local.replace('vfx/attack-candy-shards/','vfx/pop-fragments/'));
        const replacement=OCEAN_REPLACEMENTS[local];
        if(local.startsWith('vfx/') && !replacement)return null;
        return replacement?regional(replacement):null;
    }};
    BUBBLE_SCENE_SPRITES.forEach(([,path])=>pack.sceneFrame(path));
    return pack;
}
export type BubbleRegionAssets = Awaited<ReturnType<typeof loadBubbleRegion>>;
