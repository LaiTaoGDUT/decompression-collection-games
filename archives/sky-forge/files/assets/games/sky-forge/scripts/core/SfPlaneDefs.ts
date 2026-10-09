import type { SlotId } from './SfBalance';
import type { PlaneId } from './SfTypes';

export type UnlockRule =
    | { type: 'start' }
    | { type: 'gold'; value: number }
    | { type: 'endless'; value: number }
    | { type: 'clear'; value: number }
    | { type: 'stars'; value: number };

export interface SlotInfo { name: string; desc: string }

export interface PlaneDef {
    id: PlaneId;
    name: string;
    /** 类型标签（DESIGN.md §4）。 */
    tag: string;
    order: number;
    /** 主题色：机库光效、类型标签底色。 */
    color: string;
    unlock: UnlockRule;
    baseHearts: number;
    mechanic: string;
    slots: Record<SlotId, SlotInfo>;
    /** 零件等级 Lv4 / Lv7 / Lv10 特性。 */
    features: Record<SlotId, readonly [string, string, string]>;
    ultimate: { name: string; desc: string };
    /** 挂点位置（设计像素，机体中心为原点，x 取右侧并镜像）。 */
    mounts: Record<SlotId, { x: number; y: number }>;
    /** M1 已实现战斗逻辑的机体。 */
    implemented: boolean;
}

export const PLANES: readonly PlaneDef[] = [
    {
        id: 'vanguard', name: '先锋', tag: '均衡型', order: 1, color: '#4FA8FF', unlock: { type: 'start' }, baseHearts: 3,
        mechanic: '热度：持续命中同一目标，射速 2 秒内升到 +60%',
        slots: {
            main: { name: '双联机炮', desc: '向前连射，零件增加弹道' },
            wing: { name: '斜射机枪', desc: '向两侧斜射，覆盖更宽' },
            special: { name: '追踪火箭', desc: '定时射出自动追踪的火箭' },
        },
        features: {
            main: ['热度上限提高，射速最高 +80%', '热度满时主炮子弹穿透 1 个敌人', '热度满时追加重型穿甲弹'],
            wing: ['翼炮射速 +15%', '翼炮命中也会累积热度', '翼炮子弹穿透 1 个敌人'],
            special: ['每轮追加 1 枚火箭', '火箭命中产生小范围爆炸', '每轮齐射后追加第二轮'],
        },
        ultimate: { name: '先锋突击', desc: '12 架幻影战机俯冲穿屏，撞毁敌人并清除弹幕' },
        mounts: { main: { x: 26, y: 30 }, wing: { x: 40, y: -10 }, special: { x: 56, y: -26 } },
        implemented: true,
    },
    {
        id: 'thunder', name: '雷霆', tag: '爆破型', order: 2, color: '#FF5A3C', unlock: { type: 'gold', value: 1500 }, baseHearts: 3,
        mechanic: '殉爆连锁：被爆裂炮弹打死的敌人会爆炸，并可继续连锁',
        slots: {
            main: { name: '爆裂炮', desc: '命中爆炸的炮弹，带范围伤害' },
            wing: { name: '榴弹', desc: '抛向前方落地爆炸' },
            special: { name: '集束炸弹', desc: '空中散开成一片子炸弹' },
        },
        features: {
            main: ['爆炸半径 +20%', '殉爆伤害 +30%', '殉爆也会波及 Boss 和部件'],
            wing: ['每轮追加 1 枚榴弹', '榴弹落点再次爆炸', '榴弹爆炸后分裂成 3 枚小榴弹'],
            special: ['子炸弹 +2', '投放间隔 -20%', '集束炸弹爆开时清除周围敌弹'],
        },
        ultimate: { name: '地毯轰炸', desc: '轰炸机群从下往上铺满爆炸，清除沿途弹幕' },
        mounts: { main: { x: 22, y: 34 }, wing: { x: 46, y: -4 }, special: { x: 66, y: -12 } },
        implemented: true,
    },
    {
        id: 'falcon', name: '猎鹰', tag: '导弹型', order: 3, color: '#C9D94A', unlock: { type: 'gold', value: 3000 }, baseHearts: 3,
        mechanic: '锁定齐射：机头前方的敌人被逐个锁定，定时齐射追踪导弹',
        slots: {
            main: { name: '机炮', desc: '高速针弹，自带 2 个锁定位' },
            wing: { name: '锁定导弹', desc: '锁定位增加到最多 8 个' },
            special: { name: '微型导弹舱', desc: '扇形射出一排微型导弹' },
        },
        features: {
            main: ['锁定速度 +30%', '每轮齐射追加 2 枚导弹', '可以对 Boss 重复锁定'],
            wing: ['导弹伤害 +15%', '导弹命中产生爆炸', '导弹击杀时分裂出 2 枚小导弹'],
            special: ['微型导弹 +2', '发射间隔 -20%', '微型导弹也会追踪'],
        },
        ultimate: { name: '饱和打击', desc: '锁定全屏目标，一次射出 48 枚导弹' },
        mounts: { main: { x: 20, y: 30 }, wing: { x: 38, y: -8 }, special: { x: 58, y: -22 } },
        implemented: true,
    },
    {
        id: 'lightning', name: '闪电', tag: '电击型', order: 4, color: '#6CE0FF', unlock: { type: 'clear', value: 1 }, baseHearts: 3,
        mechanic: '电弧连锁：电浆弹跳向 180 像素内最近的 2 个敌人，10 层电击触发过载爆炸',
        slots: { main: { name: '电浆弹', desc: '命中后放出 35% 伤害的连锁电弧' }, wing: { name: '穿透电球', desc: '缓慢前进，穿透并叠加电击' }, special: { name: '特斯拉线圈', desc: '周期性电击 650 像素内最近敌人，强化过载' } },
        features: { main: ['电弧多跳 1 次，电浆伤害 +15%', '电弧伤害 +25%', '电弧可跳 4 次，电浆伤害翻倍'], wing: ['每侧电球 +1', '电球体积增大', '电球到期时爆炸'], special: ['过载所需次数 -2', '过载爆炸范围 +30%', '过载给周围敌人叠加 2 层电击，可连锁过载'] },
        ultimate: { name: '雷暴领域', desc: '持续 3 秒交替打击最强与随机目标，落雷清除沿途敌弹' },
        mounts: { main: { x: 22, y: 30 }, wing: { x: 40, y: -8 }, special: { x: 56, y: -22 } },
        implemented: true,
    },
    {
        id: 'frost', name: '寒冰', tag: '冰冻型', order: 5, color: '#9FE8FF', unlock: { type: 'gold', value: 6000 }, baseHearts: 3,
        mechanic: '冰冻：冰棱叠寒冷层，5 层冻结 1.5 秒，寒冰子弹对冻结目标伤害 +50%',
        slots: { main: { name: '冰棱', desc: '向前射击并叠加寒冷层' }, wing: { name: '寒雾', desc: '穿透寒雾使经过的敌弹减速 40%' }, special: { name: '水晶护盾', desc: '环绕冰晶射出冰棱，各挡 1 发敌弹，6 秒再生' } },
        features: { main: ['冻结时间 +0.5 秒，冰棱射速 +10%', '冻结目标的寒冰子弹伤害加成提高到 70%', '主炮冰棱伤害 +70%，冻结敌人碎裂时伤及周围'], wing: ['寒雾范围 +20%', '减速提高到 55%', '经过寒雾的敌弹直接冻碎'], special: ['冰晶 +1', '冰晶再生时间缩短到 4 秒', '冰晶碎裂时射出 3 枚冰片'] },
        ultimate: { name: '绝对零度', desc: '冻结全场 3 秒，冻住的敌弹碎成我方冰片' },
        mounts: { main: { x: 22, y: 30 }, wing: { x: 40, y: -8 }, special: { x: 56, y: -22 } },
        implemented: true,
    },
    {
        id: 'phantom', name: '幻影', tag: '分身型', order: 6, color: '#C77DFF', unlock: { type: 'gold', value: 10000 }, baseHearts: 3,
        mechanic: '镜像分身：屏幕对称处的分身同步射击',
        slots: { main: { name: '光弹', desc: '本体与镜像分身同步发射半伤光弹，会聚前方目标' }, wing: { name: '镜间光束', desc: '连接本体与分身伤敌，光束端点持续前射' }, special: { name: '镜片浮游炮', desc: '环绕分身发射小光弹' } },
        features: { main: ['分身伤害 +20%', '分身射速 +20%', '本体与分身光弹伤害 +90%，分身子弹穿透'], wing: ['光束更粗', '光束伤害 +30%', '光束会清除敌弹'], special: ['浮游炮 +1', '浮游炮追踪', '浮游炮射速 +30%'] },
        ultimate: { name: '万花镜', desc: '持续 4 秒由 4 个分身环形齐射，并清除分身附近敌弹' },
        mounts: { main: { x: 22, y: 30 }, wing: { x: 40, y: -8 }, special: { x: 56, y: -22 } },
        implemented: true,
    },
    {
        id: 'dawn', name: '曙光', tag: '激光型', order: 7, color: '#FFD84A', unlock: { type: 'clear', value: 2 }, baseHearts: 3,
        mechanic: '贯穿聚焦：主炮激光贯穿整列敌人，每多穿过一个敌人，后方伤害 +15%',
        slots: { main: { name: '聚焦激光', desc: '持续向前的激光，贯穿整列敌人，零件加宽光束' }, wing: { name: '摆动光束', desc: '两道斜向细激光，随左右移动摆动扫射' }, special: { name: '日轮', desc: '环绕机体的小太阳，对附近敌人放短激光' } },
        features: { main: ['贯穿加成提高到每个 +25%', '光束加宽 30%，伤害 +15%', '光束伤害 +60%，并消除触碰的敌弹'], wing: ['摆动幅度 +50%', '翼光束伤害 +30%', '翼光束也享受贯穿加成'], special: ['日轮 +1', '日轮射击间隔 -25%', '日轮激光命中后折射到附近 1 个敌人'] },
        ultimate: { name: '超新星炮', desc: '持续 3 秒跟随机体横坐标的巨型光柱，伤害整列敌人并清弹' },
        mounts: { main: { x: 22, y: 30 }, wing: { x: 40, y: -8 }, special: { x: 56, y: -22 } },
        implemented: true,
    },
    {
        id: 'wildgoose', name: '雁阵', tag: '僚机型', order: 8, color: '#7BD389', unlock: { type: 'endless', value: 3000 }, baseHearts: 3,
        mechanic: '编队：僚机按移动方向变阵——横移展开、前推会聚、后撤护卫，在队僚机能替你挡子弹',
        slots: { main: { name: '长机机炮', desc: '向前连射的曳光弹' }, wing: { name: '僚机机枪', desc: '在队僚机跟随队形射击，箭头队形会聚到正前方' }, special: { name: '编队导弹', desc: '僚机增加到 3、4 架并定时齐射追踪导弹，箭头队形集火' } },
        features: { main: ['主炮射速 +15%', '主炮穿透 1 个敌人', '主炮追加 2 条弹道'], wing: ['僚机伤害 +20%', '僚机子弹追踪', '僚机子弹加大并穿透'], special: ['僚机脱队后 4 秒归队', '僚机挡弹后反击 3 发追踪弹', '僚机可挡 2 发'] },
        ultimate: { name: '全队冲锋', desc: '僚机与幻影僚机化作光镖连续冲向敌人 4 秒，并清除身边敌弹' },
        mounts: { main: { x: 22, y: 30 }, wing: { x: 40, y: -8 }, special: { x: 56, y: -22 } },
        implemented: true,
    },
    {
        id: 'blackhole', name: '黑洞', tag: '引力型', order: 9, color: '#8A5CFF', unlock: { type: 'clear', value: 3 }, baseHearts: 3,
        mechanic: '引力：重力弹命中生成小黑洞，把小怪吸成一团；经过黑洞的我方子弹 +50% 伤害并转向追敌',
        slots: { main: { name: '重力弹', desc: '命中生成 1.5 秒小黑洞（最多 3 个）' }, wing: { name: '引力射线', desc: '两道会聚射线伤害敌人并把它们拉向中线' }, special: { name: '奇点弹', desc: '缓慢飞出后展开成持续 2 秒的大黑洞，持续伤害' } },
        features: { main: ['黑洞持续 +0.5 秒', '黑洞范围 +25%', '黑洞结束时坍缩爆炸'], wing: ['射线更长', '射线伤害 +25%', '射线命中处每 1.5 秒生成小黑洞'], special: ['大黑洞范围 +20%', '大黑洞结束时坍缩爆炸', '一次射出 2 枚奇点弹'] },
        ultimate: { name: '奇点坍缩', desc: '屏幕中上方的巨型黑洞持续 4 秒吸入敌人、吞掉敌弹并持续伤害' },
        mounts: { main: { x: 22, y: 30 }, wing: { x: 40, y: -8 }, special: { x: 56, y: -22 } },
        implemented: true,
    },
    {
        id: 'swordfish', name: '剑鱼', tag: '擦弹型', order: 10, color: '#3FD0C0', unlock: { type: 'clear', value: 4 }, baseHearts: 3,
        mechanic: '剑意：敌弹从身边擦过就积攒剑意，攒满自动斩出贯穿全屏、斩断敌弹的月牙剑气；主炮刀光离敌越近越痛',
        slots: { main: { name: '刀光', desc: '近距离扇形刀光，离敌人越近伤害越高' }, wing: { name: '剑意感应', desc: '擦弹判定范围变大，剑意攒得更快' }, special: { name: '月牙剑气', desc: '定时自动斩出小剑气，剑意剑气更宽' } },
        features: { main: ['刀光射程 +20%', '刀光穿透 1 个敌人', '贴身 150 像素内伤害再 +40%'], wing: ['擦弹范围再 +20%', '剑意获取 +30%', '擦弹时射出一道小剑气'], special: ['剑气更宽', '剑意满时一次斩出 2 道剑气', '剑气命中敌人回复剑意'] },
        ultimate: { name: '万剑齐落', desc: '4 秒内百剑从天而降，斩断沿途敌弹；期间每次擦弹再多落一把' },
        mounts: { main: { x: 22, y: 30 }, wing: { x: 40, y: -8 }, special: { x: 56, y: -22 } },
        implemented: true,
    },
    {
        id: 'dragon', name: '苍龙', tag: '长龙型', order: 11, color: '#3FD0A0', unlock: { type: 'clear', value: 5 }, baseHearts: 3,
        mechanic: '龙身：龙身节段沿你飞过的路线跟随，每节都向前开火——蛇行时弹幕铺成一片；节段能挡敌弹',
        slots: { main: { name: '龙息', desc: '龙头向前连射的龙息弹' }, wing: { name: '龙鳞炮', desc: '每节龙身向前开火' }, special: { name: '龙尾', desc: '龙身增加到 6、8 节，龙尾定时放出追踪火球' } },
        features: { main: ['龙息射速 +15%', '龙息穿透 1 个敌人', '龙息追加 2 条弹道'], wing: ['龙鳞炮伤害 +20%', '龙鳞炮追踪', '龙鳞炮加大并穿透'], special: ['节段挡弹后 2 秒恢复', '节段挡下的敌弹化作龙鳞反击', '龙尾火球 +2'] },
        ultimate: { name: '龙卷天穹', desc: '龙身拉长到 12 节绕屏盘旋 4 秒，持续开火并吞掉身边敌弹' },
        mounts: { main: { x: 22, y: 30 }, wing: { x: 40, y: -8 }, special: { x: 56, y: -22 } },
        implemented: true,
    },
    {
        id: 'chakram', name: '星环', tag: '回旋型', order: 12, color: '#FFC24A', unlock: { type: 'stars', value: 60 }, baseHearts: 3,
        mechanic: '回旋：星环飞出后折返、追着机体飞回来，去程和回程各命中一次——星环在外面时左右移动，就能把回程甩过一片敌群',
        slots: { main: { name: '星环', desc: '射出会折返的旋转星环，零件增加数量' }, wing: { name: '侧翼小星环', desc: '向两侧斜前方飞出、折返扫过两翼' }, special: { name: '大星环', desc: '定时朝敌人掷出大星环，星环整体变大' } },
        features: { main: ['星环射程 +120', '回程伤害 +50%', '星环 +1 枚'], wing: ['侧翼星环伤害 +20%', '侧翼星环张角更大', '侧翼星环 +1 对'], special: ['大星环体积 +30%', '大星环斩断沿途敌弹', '大星环 +1 枚'] },
        ultimate: { name: '星环风暴', desc: '6 个巨型星环绕机体高速公转 4 秒，吞掉敌弹并向敌人甩出追踪小星环' },
        mounts: { main: { x: 22, y: 30 }, wing: { x: 40, y: -8 }, special: { x: 56, y: -22 } },
        implemented: true,
    },
];

export const PLANE_BY_ID: Readonly<Record<PlaneId, PlaneDef>> = PLANES.reduce((map, p) => {
    map[p.id] = p;
    return map;
}, {} as Record<PlaneId, PlaneDef>);

export function unlockText(rule: UnlockRule): string {
    switch (rule.type) {
        case 'start': return '初始赠送';
        case 'gold': return `${rule.value} 金币购买`;
        case 'endless': return `无尽模式到达 ${rule.value} 米赠送`;
        case 'clear': return `通关第 ${rule.value} 章赠送`;
        case 'stars': return `战役累计 ${rule.value} 星赠送`;
    }
}
