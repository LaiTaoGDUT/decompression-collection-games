/** 保证同一时刻最多执行一个大厅进入请求。 */
export class EnterRequestLock {
    private locked = false;

    get isLocked(): boolean {
        return this.locked;
    }

    /** 返回 false 表示已有请求正在执行，本次请求没有启动。 */
    async run(request: () => Promise<void>): Promise<boolean> {
        if (this.locked) {
            return false;
        }

        this.locked = true;

        try {
            await request();
            return true;
        } finally {
            this.locked = false;
        }
    }
}
