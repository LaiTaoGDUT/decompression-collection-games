#!/usr/bin/env python3
"""导入原版动画配置；单独更新曲线时不重新导出或覆盖已压缩的图片。"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def finite_numbers(value):
    if isinstance(value, float) and not math.isfinite(value):
        return 0
    if isinstance(value, dict):
        return {key: finite_numbers(item) for key, item in value.items()}
    if isinstance(value, list):
        return [finite_numbers(item) for item in value]
    return value


def scalar_keys(curve, axis=None):
    keys = []
    for key in curve['m_Curve']:
        item = {'time': key['time'], 'weightedMode': key.get('weightedMode', 0)}
        for field in ['value', 'inSlope', 'outSlope', 'inWeight', 'outWeight']:
            value = key[field]
            item[field] = value[axis] if axis else value
        keys.append(item)
    return finite_numbers(keys)


def write_original_config(root=ROOT):
    configs = {name: json.loads((root / f'rotate-rings-sources/{name}.json').read_text())
               for name in ['RingLevelConfig', 'ButtonClickAnimationCfg']}
    directory = root / 'tmp/rotate-rings/extract/assets/effect'
    clips = {clip['m_Name']: clip for file in directory.glob('*AnimationClip.json')
             for clip in [json.loads(file.read_text())]}
    popup, combo = clips['anim_popup_open'], clips['anim_combo_show_gp1']
    def animation(clip, path, attributes):
        floats = {(c['path'], c['attribute']): c['curve'] for c in clip['m_FloatCurves']}
        scale = next(c['curve'] for c in clip['m_ScaleCurves'] if c['path'] == path)
        return {'duration': clip['m_MuscleClip']['m_StopTime'], 'scaleX': scalar_keys(scale, 'x'),
                'scaleY': scalar_keys(scale, 'y'),
                **{name: scalar_keys(floats[(p, attr)]) for name, p, attr in attributes}}
    configs['popupOpen'] = animation(popup, 'UIPanel/Content', [
        ('opacity', 'UIPanel/Content', 'm_Alpha'), ('maskOpacity', 'UIPanel/bgMask', 'm_Color.a')])
    configs['popupOpen']['duration'] = max(k['time'] for k in configs['popupOpen']['scaleX'])
    configs['comboAnimation'] = animation(combo, 'txt', [('opacity', 'txt', 'm_Alpha')])
    particle = json.loads((directory / 'assets_02_res_art_effect_prefab_maingame_a8095ea0_ParticleSystem.json').read_text())
    configs['releaseParticles'] = {key: particle[key] for key in ['InitialModule', 'ShapeModule', 'EmissionModule',
        'SizeModule', 'RotationModule', 'ColorModule', 'UVModule', 'VelocityModule', 'NoiseModule']}
    # 评分器和原 ComboEffectPlayer 的常量来自已还原 native .rodata；来源记录供复核。
    configs['comboScore'] = {'releaseScores': [30, 60, 100], 'streakBonuses': [0, 10, 20, 40, 60],
        'missPenalties': [0, 0, -5, -10, -20], 'thresholds': [41, 60, 81],
        'halfSizes': [[163.5, 62], [200, 80], [280, 80]], 'designWidth': 1080}
    (root / 'rotate-rings-sources/feedback-config.json').write_text(
        json.dumps(finite_numbers({k: v for k, v in configs.items() if k not in ['RingLevelConfig', 'ButtonClickAnimationCfg']}),
                   ensure_ascii=False, indent=2) + '\n')
    (root / 'assets/games/rotate-rings/scripts/RotateRingsOriginalConfig.ts').write_text(
        '// Generated from original Unity serialized parameters.\nexport const ORIGINAL_RING_CONFIG = '
        + json.dumps(finite_numbers(configs), ensure_ascii=False, separators=(',', ':')) + ' as const;\n')


if __name__ == '__main__':
    write_original_config()
    print('Imported original wave, popup, combo and mesh-emitted ceramic fragment parameters.')
