interface Point { x: number; y: number; data?: Float32Array; }
interface Rotation { c: number; s: number; }
interface Transform { p: Point; q: Rotation; constructor: Function; }

/** 仅在本游戏持有 Box2D JS 世界期间启用，退出时恢复全部方法。
 * 3.8.8 的向量访问器每次 x/y 读写都会再访问 Float32Array；CCD 的 GJK 和
 * 求解器反复经过这些小函数。直接读写同一数组，保留每次存储的 Float32 舍入、
 * 表达式顺序和输入/输出别名行为；普通 Point/Cocos Vec2 仍兼容原协议。
 */
export function configureCyBlockBeesBox2DMath(world: unknown): () => void {
    const native = world as { m_gravity: { constructor: Function };
        m_bodyList: { m_xf: Transform & { q: Rotation & { constructor: Function } } } };
    // Cocos 的 b2PhysicsWorld 在初始化时已经创建 groundBody，使用其变换类型，
    // 不依赖仅供调试绘制的静态临时对象。
    const vector = native.m_gravity.constructor, transform = native.m_bodyList.m_xf;
    const restore: (() => void)[] = [];
    const replace = (target: object, name: string, value: Function): void => {
        const descriptor = Object.getOwnPropertyDescriptor(target, name);
        if (!descriptor || typeof descriptor.value !== 'function') throw new Error(`Box2D JS 缺少方法 ${name}`);
        Object.defineProperty(target, name, { ...descriptor, value });
        restore.push(() => { Object.defineProperty(target, name, descriptor); });
    };
    const dispose = (): void => { for (let i = restore.length - 1; i >= 0; i--) restore[i](); restore.length = 0; };
    try {
        replace(vector.prototype, 'Copy', function (this: Point & { data: Float32Array }, other: Point): Point {
            const data = this.data, source = other.data;
            data[0] = source ? source[0] : other.x;
            data[1] = source ? source[1] : other.y;
            return this;
        });
        replace(vector.prototype, 'Set', function (this: Point & { data: Float32Array }, x: number, y: number): Point {
            this.data[0] = x; this.data[1] = y; return this;
        });
        replace(vector, 'DotVV', function (a: Point, b: Point): number {
            const ad = a.data, bd = b.data;
            return (ad ? ad[0] : a.x) * (bd ? bd[0] : b.x) + (ad ? ad[1] : a.y) * (bd ? bd[1] : b.y);
        });
        replace(vector, 'SubVV', function (a: Point, b: Point, out: Point): Point {
            const ad = a.data, bd = b.data, od = out.data;
            if (od) {
                od[0] = (ad ? ad[0] : a.x) - (bd ? bd[0] : b.x);
                od[1] = (ad ? ad[1] : a.y) - (bd ? bd[1] : b.y);
            } else {
                out.x = (ad ? ad[0] : a.x) - (bd ? bd[0] : b.x);
                out.y = (ad ? ad[1] : a.y) - (bd ? bd[1] : b.y);
            }
            return out;
        });
        replace(transform.constructor, 'MulXV', function (pose: Transform, v: Point, out: Point): Point {
            const c = pose.q.c, s = pose.q.s, vd = v.data, pd = pose.p.data, od = out.data;
            const x = vd ? vd[0] : v.x, y = vd ? vd[1] : v.y;
            if (od) {
                od[0] = (c * x - s * y) + (pd ? pd[0] : pose.p.x);
                od[1] = (s * x + c * y) + (pd ? pd[1] : pose.p.y);
            } else {
                out.x = (c * x - s * y) + (pd ? pd[0] : pose.p.x);
                out.y = (s * x + c * y) + (pd ? pd[1] : pose.p.y);
            }
            return out;
        });
        replace(transform.q.constructor, 'MulRV', function (rotation: Rotation, v: Point, out: Point): Point {
            const c = rotation.c, s = rotation.s, vd = v.data, od = out.data;
            const x = vd ? vd[0] : v.x, y = vd ? vd[1] : v.y;
            if (od) { od[0] = c * x - s * y; od[1] = s * x + c * y; }
            else { out.x = c * x - s * y; out.y = s * x + c * y; }
            return out;
        });
        return dispose;
    } catch (error) { dispose(); throw error; }
}
