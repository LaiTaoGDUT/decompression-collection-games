import { _decorator, Button, Component, Node } from 'cc';
import type {
    MiniGame,
    MiniGameContext,
} from '../../../runtime/MiniGame';

const { ccclass } = _decorator;

export const PLACEHOLDER_GAME_STATES = [
    'created',
    'initialized',
    'running',
    'paused',
    'disposed',
] as const;

export type PlaceholderGameState = (typeof PLACEHOLDER_GAME_STATES)[number];
export type PlaceholderLifecycleAction =
    | 'initialize'
    | 'begin'
    | 'pause'
    | 'resume'
    | 'restart'
    | 'dispose';

export class PlaceholderLifecycleError extends Error {
    constructor(
        readonly action: PlaceholderLifecycleAction,
        readonly state: PlaceholderGameState,
        readonly allowedStates: readonly PlaceholderGameState[],
    ) {
        super(
            `Cannot ${action} placeholder game while state is "${state}"; `
            + `expected ${allowedStates.map((allowed) => `"${allowed}"`).join(' or ')}.`,
        );
        this.name = 'PlaceholderLifecycleError';
    }
}

/** 用于验证运行层调用顺序的无玩法占位游戏。 */
@ccclass('PlaceholderGame')
export class PlaceholderGame extends Component implements MiniGame {
    private currentState: PlaceholderGameState = 'created';
    private gameContext?: MiniGameContext;
    private exitButton?: Node;
    private readonly actions: PlaceholderLifecycleAction[] = [];

    get state(): PlaceholderGameState {
        return this.currentState;
    }

    get lifecycleHistory(): readonly PlaceholderLifecycleAction[] {
        return Object.freeze([...this.actions]);
    }

    async initialize(context: MiniGameContext): Promise<void> {
        this.requireState('initialize', ['created']);
        this.gameContext = context;
        const exitButton = this.node.getChildByName('ExitButton');

        if (!exitButton || !exitButton.getComponent(Button)) {
            this.gameContext = undefined;
            throw new Error('Placeholder game ExitButton is missing.');
        }

        this.exitButton = exitButton;
        exitButton.on(Button.EventType.CLICK, this.handleExitClick, this);
        this.transition('initialize', 'initialized');
    }

    begin(): void {
        this.requireState('begin', ['initialized']);
        this.requireContext();
        this.transition('begin', 'running');
    }

    pause(): void {
        this.requireState('pause', ['running']);
        this.requireContext();
        this.transition('pause', 'paused');
    }

    resume(): void {
        this.requireState('resume', ['paused']);
        this.requireContext();
        this.transition('resume', 'running');
    }

    async restart(): Promise<void> {
        this.requireState('restart', ['running', 'paused']);
        this.requireContext();
        this.transition('restart', 'running');
    }

    async dispose(): Promise<void> {
        this.requireState('dispose', ['initialized', 'running', 'paused']);
        this.requireContext();
        this.transition('dispose', 'disposed');
        this.exitButton?.off(Button.EventType.CLICK, this.handleExitClick, this);
        this.exitButton = undefined;
        this.gameContext = undefined;
    }

    private requireContext(): MiniGameContext {
        if (!this.gameContext) {
            throw new Error('Placeholder game context is unavailable.');
        }

        return this.gameContext;
    }

    private requireState(
        action: PlaceholderLifecycleAction,
        allowedStates: readonly PlaceholderGameState[],
    ): void {
        if (allowedStates.indexOf(this.currentState) < 0) {
            throw new PlaceholderLifecycleError(
                action,
                this.currentState,
                allowedStates,
            );
        }
    }

    private transition(
        action: PlaceholderLifecycleAction,
        nextState: PlaceholderGameState,
    ): void {
        const context = this.requireContext();
        const previousState = this.currentState;
        this.currentState = nextState;
        this.actions.push(action);
        console.info(
            `[PlaceholderGame] ${action}: ${previousState} -> ${nextState}`,
            { gameId: context.gameId, sessionId: context.sessionId },
        );
    }

    private readonly handleExitClick = (): void => {
        this.requireContext().requestExit();
    };
}
