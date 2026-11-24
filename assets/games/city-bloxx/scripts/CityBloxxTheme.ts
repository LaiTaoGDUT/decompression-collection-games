/** Frozen “云端天梯” art direction; 750 × 1334, all geometry in design pixels. */
export const CITY_THEME = Object.freeze({
    name: '云端天梯',
    ivory: '#FFF7E6', ink: '#17334D', muted: '#76818A',
    brass: '#F5BC51', amber: '#E8A23A', goldInk: '#B47A16', cream: '#FCEFD2', navy: '#1E3A5C', rose: '#FF8A7A',
    disabled: '#A8B3BF',
});

/** One painted sky region per stage; `icon` names a frame in the HUD atlas. */
export const CITY_ALTITUDES = Object.freeze([
    { floor: 0, name: '城市街区', icon: 'zone-city', subtitle: '从这里，建向星空' },
    { floor: 24, name: '摩天之巅', icon: 'zone-rooftop', subtitle: '整座城市都在脚下' },
    { floor: 48, name: '云海之上', icon: 'zone-clouds', subtitle: '穿过云层，阳光正好' },
    { floor: 84, name: '金色晚霞', icon: 'zone-sunset', subtitle: '天空被染成了金色' },
    { floor: 116, name: '平流层', icon: 'zone-stratosphere', subtitle: '第一颗星星出现了' },
    { floor: 190, name: '近地轨道', icon: 'zone-orbit', subtitle: '你好，浩瀚宇宙' },
    { floor: 270, name: '月光航道', icon: 'zone-moon', subtitle: '月亮就在身旁' },
    { floor: 360, name: '星云深处', icon: 'zone-nebula', subtitle: '每一层，都离星空更近' },
    { floor: 520, name: '银河彼方', icon: 'zone-galaxy', subtitle: '踏入浩瀚群星深处' },
]);

export function cityAltitudeIndex(floors: number): number {
    let index = 0;
    for (let i = 0; i < CITY_ALTITUDES.length; i++) if (floors >= CITY_ALTITUDES[i].floor) index = i;
    return index;
}
