/**
 * 类型安全的服务标识。
 * `serviceType` 只参与 TypeScript 类型推导，不包含运行时数据。
 */
export interface ServiceToken<TService> {
    readonly key: symbol;
    readonly name: string;
    readonly serviceType?: (service: TService) => TService;
}

/** 为一种服务创建永久唯一的运行时标识。 */
export function createServiceToken<TService>(name: string): ServiceToken<TService> {
    if (name.trim().length === 0) {
        throw new Error('Service token name cannot be empty.');
    }

    return Object.freeze({
        key: Symbol(name),
        name,
    });
}

/**
 * 保存应用启动阶段显式创建的服务实例。
 * 容器不负责自动创建、销毁或扫描服务依赖。
 */
export class ServiceContainer {
    private readonly services = new Map<symbol, unknown>();

    register<TService>(token: ServiceToken<TService>, service: TService): void {
        if (this.services.has(token.key)) {
            throw new Error(`Service "${token.name}" is already registered.`);
        }

        this.services.set(token.key, service);
    }

    get<TService>(token: ServiceToken<TService>): TService {
        if (!this.services.has(token.key)) {
            throw new Error(`Service "${token.name}" is not registered.`);
        }

        return this.services.get(token.key) as TService;
    }

    has<TService>(token: ServiceToken<TService>): boolean {
        return this.services.has(token.key);
    }
}
