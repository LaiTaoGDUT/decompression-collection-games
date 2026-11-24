export interface ArrowPaletteEntry {
    main: string;
    shadow: string;
    highlight: string;
    name: string;
}

export const CUBE_AWAY_THEME = {
    themeName: '魔方小蛇 · Mint Snake Garden',
    accentColor: '#A95141',
    backdropTop: '#FCF3EF',
    backdropCenter: '#FCF5EE',
    backdropBottom: '#FBF1E9',
    ink: '#573C36',
    inkMuted: '#80675E',
    inkOnDark: '#FFFFFF',
    cardBg: '#FFF8ED',
    cardBorder: '#EADAD0',
    panelShade: '#75615D',
    primaryButton: '#FBCAB3',
    coralButton: '#C45D4F',
    honeyButton: '#FAE5B8',
    secondaryButton: '#F1E4DA',
    mapRoute: '#E6D2C5',
    levelCurrent: '#F7B5A2',
    levelCleared: '#E2EBDB',
    cubeSurface: '#FFF9EF',
    cornerlessBridge: '#4D967B',
    arrowMain: '#111114',
    arrowShadow: '#0A0B0D',
    arrowHintGlow: '#F5D77E',
    arrowErrorGlow: '#FF9588',
    pauseColor: '#A46122',
    changerColor: '#347653',
    reverseColor: '#79549D',
    splitColor: '#276E89',
    dangerColor: '#FF8675',
    goldColor: '#F5CA5B',
} as const;

export const ARROW_PALETTE: readonly ArrowPaletteEntry[] = [
    { main: '#F57565', shadow: '#A84239', highlight: '#FFE9BA', name: '珊瑚' },
    { main: '#93B64D', shadow: '#536D29', highlight: '#F4F2C6', name: '嫩叶' },
    { main: '#B18BD6', shadow: '#735394', highlight: '#F4E5FA', name: '丁香' },
    { main: '#F4B841', shadow: '#95631B', highlight: '#FFF1C0', name: '奶黄' },
    { main: '#54B4A2', shadow: '#30766C', highlight: '#DAF3DD', name: '薄荷' },
    { main: '#66B1D9', shadow: '#376F91', highlight: '#E2F3FF', name: '晴蓝' },
    { main: '#E586AB', shadow: '#99476B', highlight: '#FFE5EE', name: '桃粉' },
    { main: '#EE965B', shadow: '#99552F', highlight: '#FFF0C9', name: '蜜橘' },
    { main: '#91A3DA', shadow: '#586A9D', highlight: '#EBF1FF', name: '雾蓝' },
    { main: '#84BC83', shadow: '#4A7850', highlight: '#F1F6D2', name: '抹茶' },
    { main: '#CC8EC3', shadow: '#8D5489', highlight: '#FCE7F5', name: '莓紫' },
    { main: '#CDA568', shadow: '#85653B', highlight: '#FFF1CD', name: '燕麦' },
];

export interface MechanicGuideInfo {
    key: string;
    title: string;
    badge: string;
    color: string;
    summary: string;
}

export const MECHANIC_GUIDES: Record<string, MechanicGuideInfo> = {
    basic: { key: 'basic', title: '轻点小蛇出发', badge: '引导', color: CUBE_AWAY_THEME.primaryButton, summary: '顺着蛇头方向，找到畅通出口。\n拖动空白处可以旋转观察。' },
    carved: { key: 'carved', title: '镂空也能穿过', badge: '结构', color: '#8DCCC8', summary: '小蛇会沿原方向穿过缺口，\n前方畅通才能离开。' },
    cornerless: { key: 'cornerless', title: '柔棱可以跨面', badge: '顺弯', color: '#8DCCA8', summary: '经过柔棱时，小蛇会贴着\n相邻面继续前进。' },
    double: { key: 'double', title: '两头都能出发', badge: '双头', color: '#EDC967', summary: '点击靠近哪一端，就向那一端前进。\n先选畅通的一侧。' },
    pause: { key: 'pause', title: '暂停一下再出发', badge: '机关', color: '#EDC967', summary: '进入暂停格会先停下，再点一次\n小蛇就会继续前进。' },
    changer: { key: 'changer', title: '跟着转向格走', badge: '机关', color: '#8DCCA8', summary: '小蛇进入转向格，会按格子里的\n方向继续前进。' },
    reverse_changer: { key: 'reverse_changer', title: '方向会反过来', badge: '机关', color: '#C7A0E6', summary: '每经过一条小蛇，机关方向就会反转。\n留意下一条的路线。' },
    branch: { key: 'branch', title: '一起出发的小伙伴', badge: '联动', color: '#FF8A79', summary: '同组小蛇要一起畅通才能离开。\n只要一条受阻，就会一起退回。' },
    split_changer: { key: 'split_changer', title: '两条路都要畅通', badge: '分流', color: '#8ACDDD', summary: '经过分流格会分成两路，\n两边都畅通才能顺利离开。' },
};
