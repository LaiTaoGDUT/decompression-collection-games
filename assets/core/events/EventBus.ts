import type { Unsubscribe } from '../types/CommonTypes';

type EventName<TEvents extends object> = Extract<keyof TEvents, string>;
type EventListener<TPayload> = (payload: TPayload) => void;
type StoredListener = (payload: unknown) => void;

/**
 * 同步、类型安全的进程内事件总线。
 *
 * 发布时使用监听快照，因此监听者在回调中订阅或取消订阅，
 * 不会改变当前这一次发布需要通知的监听者集合。
 */
export class EventBus<TEvents extends object> {
    private readonly listeners = new Map<
        EventName<TEvents>,
        Set<StoredListener>
    >();

    subscribe<TName extends EventName<TEvents>>(
        eventName: TName,
        listener: EventListener<TEvents[TName]>,
    ): Unsubscribe {
        let eventListeners = this.listeners.get(eventName);

        if (!eventListeners) {
            eventListeners = new Set<StoredListener>();
            this.listeners.set(eventName, eventListeners);
        }

        const storedListener = listener as StoredListener;
        eventListeners.add(storedListener);

        let subscribed = true;

        return () => {
            if (!subscribed) {
                return;
            }

            subscribed = false;
            eventListeners?.delete(storedListener);

            if (eventListeners?.size === 0) {
                this.listeners.delete(eventName);
            }
        };
    }

    publish<TName extends EventName<TEvents>>(
        eventName: TName,
        payload: TEvents[TName],
    ): void {
        const eventListeners = this.listeners.get(eventName);

        if (!eventListeners || eventListeners.size === 0) {
            return;
        }

        const snapshot = Array.from(eventListeners);
        let firstError: unknown;
        let hasError = false;

        for (const listener of snapshot) {
            try {
                listener(payload);
            } catch (error: unknown) {
                if (!hasError) {
                    firstError = error;
                    hasError = true;
                }
            }
        }

        if (hasError) {
            throw firstError;
        }
    }

    clear<TName extends EventName<TEvents>>(eventName?: TName): void {
        if (eventName === undefined) {
            this.listeners.clear();
            return;
        }

        this.listeners.delete(eventName);
    }
}
