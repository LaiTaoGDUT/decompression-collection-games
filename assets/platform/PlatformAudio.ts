/** 浏览器与小游戏 WebAudio 的共同能力；平台 SDK 类型不进入业务层。 */
export interface PlatformAudioBuffer {
    readonly duration: number;
}

export interface PlatformAudioNode {
    connect(destination: PlatformAudioNode): unknown;
    disconnect(): void;
}

export interface PlatformAudioSource extends PlatformAudioNode {
    buffer: PlatformAudioBuffer | null;
    loop: boolean;
    onended: (() => void) | null;
    start(when?: number, offset?: number, duration?: number): void;
    stop(): void;
}

export interface PlatformAudioGain extends PlatformAudioNode {
    readonly gain: { value: number };
}

export interface PlatformAudioContext {
    readonly destination: PlatformAudioNode;
    readonly state: string;
    createBufferSource(): PlatformAudioSource;
    createGain(): PlatformAudioGain;
    /** 微信使用回调；浏览器也可能同时返回 Promise。 */
    decodeAudioData(data: ArrayBuffer,
        success: (buffer: PlatformAudioBuffer) => void,
        failure: (error: unknown) => void): unknown;
    resume(): Promise<unknown> | void;
    close(): Promise<unknown> | void;
}
