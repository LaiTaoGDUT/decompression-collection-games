/** Frozen Cloudline art direction; 750 × 1334, all geometry in design pixels. */
export const CITY_THEME = Object.freeze({
    name: '云端造城',
    ivory: '#FFF7E6', ink: '#17334D', muted: '#76818A', coral: '#F5BC51',
    sage: '#9AB8A3', brass: '#F5BC51', pale: '#F0E9D9', edge: '#DCD5C5',
    disabled: '#BCC6CC',
});

export const CITY_ALTITUDES = Object.freeze([
    { floor: 0, name: '城市街区', icon: 'icon-city', subtitle: '从这里，建向星空' },
    { floor: 48, name: '云海之上', icon: 'cloud-bank', subtitle: '把城市留在脚下' },
    { floor: 116, name: '平流层', icon: 'airplane', subtitle: '穿过最后一片云' },
    { floor: 190, name: '近地轨道', icon: 'moon', subtitle: '你好，浩瀚宇宙' },
    { floor: 360, name: '深空漫游', icon: 'saturn', subtitle: '每一层，都离星空更近' },
]);

export function cityAltitude(floors: number): typeof CITY_ALTITUDES[number] {
    let stage = CITY_ALTITUDES[0];
    for (const candidate of CITY_ALTITUDES) if (floors >= candidate.floor) stage = candidate;
    return stage;
}
