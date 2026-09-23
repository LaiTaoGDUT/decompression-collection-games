import { SpriteFrame } from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';
import { BUBBLE_SCENE_SPRITES } from './BubbleShooterSceneBindings';
import type { BubbleRegion } from './BubbleShooterRound';

const OCEAN_REPLACEMENTS: Readonly<Record<string,string>> = {
    'backgrounds/background':'backgrounds/background',
    'backgrounds/cloud-transition':'backgrounds/reef-ceiling-v2',
    'launcher/launcher-head':'launcher/turret',
    'launcher/launcher-turret':'launcher/turret',
    'launcher/launcher-pedestal':'launcher/base',
    'launcher/swap-icon':'hud/swap',
    'hud/hud-pause-button':'hud/pause',
    'hud/hud-down-arrow':'hud/down',
    'hud/hud-frosting-skill':'bubbles/bubble-support',
    'reward-cloud/reward-cloud-title':'reward/celebration',
    'vfx/attack-energy-heart':'vfx/attack-pearl-v1',
};

/** A validated set of frames acquired exclusively through the session AssetService. */
export async function loadBubbleRegion(assets: AssetService, region: BubbleRegion) {
    await assets.prepareBundle('game-bubble-shooter-assets','visual/common');
    const bundle=await assets.prepareBundle('game-bubble-shooter-assets',`visual/regions/${region}`);
    const get=(path:string):SpriteFrame=>{
        const frame=bundle.get(`${path}/spriteFrame`,SpriteFrame);
        if(!frame)throw new Error(`Missing ${region} SpriteFrame: ${path}`);
        return frame;
    };
    const regional=(path:string)=>get(`visual/regions/${region}/${path}`);
    // Validate critical assets before a transition commits gameplay/reward state.
    ['bubbles/bubble-red','bubbles/bubble-yellow','bubbles/bubble-blue','bubbles/bubble-purple','bubbles/bubble-support','backgrounds/background'].forEach(regional);
    if(region==='ocean') ['backgrounds/reef-ceiling-v2','vfx/attack-pearl-v1','launcher/turret','launcher/base','hud/health-track','hud/health-fill','hud/pause','hud/down','hud/swap','hud/item-base',
        'boss/boss-body','boss/boss-crown','boss/boss-staff-arm','boss/boss-right-arm','reward/celebration',
        'decoration/fish','decoration/seaweed','foreground/water-bubble-single'].forEach(regional);
    const pack = {region,regional,sceneFrame(path:string):SpriteFrame|null {
        if(region==='ocean' && path==='visual/common/items/item-button-base')return regional('hud/item-base');
        if(path.startsWith('visual/common/'))return get(path);
        const local=path.replace('visual/regions/cloud/','');
        if(region==='cloud')return regional(local);
        if(local.startsWith('bubbles/') && local!=='bubbles/frosting-overlay')return regional(local);
        const replacement=OCEAN_REPLACEMENTS[local];
        if(local.startsWith('vfx/') && !replacement)return null;
        return replacement?regional(replacement):null;
    }};
    BUBBLE_SCENE_SPRITES.forEach(([,path])=>pack.sceneFrame(path));
    return pack;
}
export type BubbleRegionAssets = Awaited<ReturnType<typeof loadBubbleRegion>>;
