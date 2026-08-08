import type { Unsubscribe } from '../types/CommonTypes';
import { EventBus } from '../events/EventBus';
import {
    APP_STATE_TRANSITIONS,
    type AppState,
} from './AppState';

/** 一次成功状态转换的只读描述。 */
export interface AppStateTransition {
    readonly from: AppState;
    readonly to: AppState;
}

interface AppStateMachineEvents {
    readonly beforeTransition: AppStateTransition;
    readonly afterTransition: AppStateTransition;
}

type TransitionEventName = keyof AppStateMachineEvents;

/**
 * 应用流程的同步有限状态机。
 * 只负责状态转换，不负责场景切换或其他业务副作用。
 */
export class AppStateMachine {
    private readonly events = new EventBus<AppStateMachineEvents>();
    private state: AppState;
    private transitioning = false;

    constructor(initialState: AppState = 'booting') {
        this.state = initialState;
    }

    get currentState(): AppState {
        return this.state;
    }

    canTransition(nextState: AppState): boolean {
        if (this.transitioning || nextState === this.state) {
            return false;
        }

        return APP_STATE_TRANSITIONS[this.state].indexOf(nextState) >= 0;
    }

    transition(nextState: AppState): boolean {
        if (!this.canTransition(nextState)) {
            return false;
        }

        const transition: AppStateTransition = Object.freeze({
            from: this.state,
            to: nextState,
        });

        this.transitioning = true;

        try {
            this.events.publish('beforeTransition', transition);
            this.state = nextState;
            this.events.publish('afterTransition', transition);
            return true;
        } finally {
            this.transitioning = false;
        }
    }

    subscribe<TName extends TransitionEventName>(
        eventName: TName,
        listener: (transition: AppStateMachineEvents[TName]) => void,
    ): Unsubscribe {
        return this.events.subscribe(eventName, listener);
    }
}
