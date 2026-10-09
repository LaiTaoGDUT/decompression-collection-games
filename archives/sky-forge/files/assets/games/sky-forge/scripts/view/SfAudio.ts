import type { AudioClip } from 'cc';
import type { AudioService, AudioVoiceScope } from '../../../../services/audio/AudioService';
import type { SfCombat } from '../core/SfCombat';
import type { CombatEvent, PlaneId } from '../core/SfTypes';
import { CUES, PLANE_AUDIO, type SoundLane } from './SfAudioCatalog';
import { AUDIO_PEAKS, AUDIO_PEAK_STEP } from './SfAudioProfile';
export { ALL_AUDIO, BOOT_AUDIO, UI_AUDIO, MENU_MUSIC, COMBAT_AUDIO, BATTLE_MUSIC, AMBIENCE_AUDIO } from './SfAudioCatalog';

interface Voice {
    scope: AudioVoiceScope;
    until: number;
    started: number;
    priority: number;
    key: string;
    gain: number;
}
interface LoopVoice { scope: AudioVoiceScope; key: string; gain: number; until: number }
const BUDGET: Readonly<Record<SoundLane, number>> = { shot: 4, impact: 4, critical: 3, ui: 2 };
const EVENT_PRIORITY: Readonly<Record<string, number>> = {
    dead: 5, hurt: 4, 'boss-warning': 4, 'boss-phase': 4, ultimate: 4, 'boss-defeated': 4,
    'energy-full': 3, 'boss-part': 3, assemble: 2, repair: 2, kill: 1,
};

/** 本局音频调度：资源经 AssetService；声部、开关与平台生命周期经 AudioService。 */
export class SfAudio {
    private readonly clips: Record<string, AudioClip> = {};
    private readonly pending = new Map<string, Promise<void>>();
    private readonly last: Record<string, number> = {};
    private readonly voices: Record<SoundLane, Voice[]> = { shot: [], impact: [], critical: [], ui: [] };
    private readonly loops = new Map<string, LoopVoice>();
    private readonly accepted: Record<string, number> = {};
    private readonly resultVoice?: AudioVoiceScope;
    private time = 0;
    private track = '';
    private paused = false;
    private disposed = false;
    private combatEnabled = false;
    private duckUntil = 0;
    private duckTarget = 1;
    private duckGain = 1;
    private shotBlockUntil = 0;
    private resultRemaining = 0;
    private ambienceTime = 0;
    private suppressed = 0;
    private headroomGain = 1;

    constructor(private readonly audio: AudioService, private readonly load: (path: string) => Promise<AudioClip>) {
        this.resultVoice = audio.createVoiceScope?.('music');
    }

    async preload(keys: readonly string[]): Promise<void> {
        // 分批解码且同一文件只有一个在途请求，避免战斗资源同时占满解码队列。
        for (let i = 0; i < keys.length && !this.disposed; i += 6) {
            await Promise.all(keys.slice(i, i + 6).map(key => this.loadKey(key)));
        }
    }

    private loadKey(key: string): Promise<void> {
        if (this.disposed || this.clips[key]) return Promise.resolve();
        const existing = this.pending.get(key);
        if (existing) return existing;
        const request = this.load(`audio/${key}`).then(clip => {
            if (this.disposed) return;
            this.clips[key] = clip;
            if (key === this.track) this.startTrack(.5);
        }, error => console.warn('[SkyForge] audio missing', key, error));
        this.pending.set(key, request);
        void request.then(() => { if (this.pending.get(key) === request) this.pending.delete(key); });
        return request;
    }

    tick(dt: number): void {
        if (this.disposed || this.audio.isBackgroundPaused) return;
        this.time += Math.max(0, dt);
        if (this.time >= this.duckUntil) this.duckTarget = 1;
        const rate = this.duckTarget < this.duckGain ? 24 : 5;
        this.duckGain += (this.duckTarget - this.duckGain) * Math.min(1, dt * rate);
        this.audio.setMusicGain(this.duckGain);
        (Object.keys(this.voices) as SoundLane[]).forEach(lane => {
            this.voices[lane].forEach(voice => {
                if (voice.until <= this.time) voice.scope.stop();
            });
        });
        this.balanceVoices(dt);
        this.loops.forEach((voice, id) => {
            if (voice.until <= this.time) this.stopLoop(id, id === 'weapon');
            else voice.scope.setVolume(voice.gain * (this.duckTarget < 1 ? .6 : 1));
        });
        if (this.resultRemaining > 0 && !this.paused && this.resultVoice?.playing) {
            this.resultRemaining = Math.max(0, this.resultRemaining - dt);
            if (this.resultRemaining === 0) this.resultVoice?.stop();
        }
    }

    play(key: string, volume = 1): void {
        if (this.disposed) return;
        if (key.indexOf('jingle-') === 0) { this.playMusic(key, .2); return; }
        const config = CUES[key], clip = this.clips[key];
        if (!config || !clip || !this.audio.isSoundEnabled || this.audio.isBackgroundPaused) return;
        if (this.paused && config.lane !== 'ui') return;
        if (this.time - (this.last[key] ?? -10) < config.interval
            || (config.lane === 'shot' && this.time < this.shotBlockUntil)) { this.suppressed++; return; }
        const pool = this.voices[config.lane];
        let voice = pool.find(v => !v.scope.playing || v.until <= this.time);
        if (!voice && pool.length < BUDGET[config.lane]) {
            const scope = this.audio.createVoiceScope?.();
            if (scope) { voice = { scope, until: 0, started: 0, priority: 0, key: '', gain: 0 }; pool.push(voice); }
        }
        if (!voice) {
            const candidates = pool.filter(v => v.priority <= config.priority && this.time - v.started >= .08);
            candidates.sort((a, b) => a.priority - b.priority || a.started - b.started);
            voice = candidates[0];
        }
        if (!voice) { this.suppressed++; return; }
        const gain = config.gain * Math.max(0, volume);
        // 新声部先静音启动；接受本帧所有声音后立即分配音量，避免首个音频块越过混音余量。
        if (!voice.scope.play(clip, 0, false)) return;
        voice.gain = gain; voice.key = key; voice.priority = config.priority; voice.started = this.time;
        voice.until = this.time + Math.max(.06, clip.getDuration());
        this.last[key] = this.time;
        this.accepted[key] = (this.accepted[key] ?? 0) + 1;
        if (config.duck < 1) this.duck(config.duck, config.hold);
        this.balanceVoices();
    }

    private voicePeak(voice: Voice): number {
        const profile = AUDIO_PEAKS[voice.key];
        if (!profile?.frames.length) return profile?.peak ?? 1;
        const age = voice.scope.currentTime;
        const start = Math.max(0, Math.floor((age - .025) / AUDIO_PEAK_STEP));
        const end = Math.min(profile.frames.length, Math.ceil((age + .15) / AUDIO_PEAK_STEP) + 1);
        let peak = 0;
        for (let i = start; i < end; i++) peak = Math.max(peak, profile.frames[i] / 255);
        return peak;
    }

    private balanceVoices(dt = 0): void {
        const shots = this.voices.shot.filter(v => v.scope.playing && v.until > this.time).length;
        const critical = this.voices.critical.some(v => v.scope.playing && v.until > this.time && this.voicePeak(v) * v.gain > .04);
        const routine = Math.max(.4, Math.sqrt(2 / Math.max(2, shots)));
        const weights: Record<SoundLane, number> = {
            shot: routine * (critical ? .65 : 1), impact: critical ? .72 : 1, critical: 1, ui: 1,
        };
        let requested = 0;
        (Object.keys(this.voices) as SoundLane[]).forEach(lane => {
            this.voices[lane].forEach(v => { if (v.scope.playing && v.until > this.time) requested += this.voicePeak(v) * v.gain * weights[lane]; });
        });
        // 为交叉淡入淡出的两条配乐保留最大峰值，循环按真实素材峰值计入。
        // 单次音效按实际播放位置的峰值包络计入，衰减尾音不再按满音量压弱新起音。
        const musicPeak = Math.max(...['bgm-hangar', 'bgm-battle', 'bgm-boss', 'bgm-rage'].map(k => AUDIO_PEAKS[k]?.peak ?? 1));
        let background = this.audio.isMusicEnabled && this.track.indexOf('bgm-') === 0 ? musicPeak * .55 * this.duckGain : 0;
        if (this.resultVoice?.playing) background += (AUDIO_PEAKS[this.track]?.peak ?? 1) * CUES[this.track].gain;
        this.loops.forEach(v => { if (v.scope.playing) background += (AUDIO_PEAKS[v.key]?.peak ?? 1) * v.gain * (this.duckTarget < 1 ? .6 : 1); });
        const target = Math.min(1, Math.max(0, .94 - background) / Math.max(.001, requested));
        // 压低立即生效，释放约 125 ms，避免新旧尾音交错时音量来回抽动。
        this.headroomGain = target < this.headroomGain ? target : this.headroomGain + (target - this.headroomGain) * Math.min(1, dt * 8);
        (Object.keys(this.voices) as SoundLane[]).forEach(lane => {
            this.voices[lane].forEach(v => { if (v.scope.playing && v.until > this.time) v.scope.setVolume(v.gain * weights[lane] * this.headroomGain); });
        });
    }

    private duck(target: number, seconds: number): void {
        this.duckTarget = Math.min(this.duckTarget, target);
        this.duckUntil = Math.max(this.duckUntil, this.time + seconds);
        this.shotBlockUntil = Math.max(this.shotBlockUntil, this.time + .07);
        this.voices.shot.forEach(voice => { voice.scope.setVolume(voice.gain * .3); });
    }

    playMusic(key: string, fade = .55): void {
        if (this.disposed || this.track === key) return;
        this.track = key;
        if (key === 'bgm-hangar') this.endCombat();
        else if (key.indexOf('bgm-') === 0) this.combatEnabled = true;
        else if (key.indexOf('jingle-') === 0) this.endCombat(true);
        this.startTrack(fade);
    }

    private startTrack(fade: number): void {
        const clip = this.clips[this.track];
        if (!clip || this.disposed) return;
        this.resultVoice?.stop(); this.resultRemaining = 0;
        if (this.track.indexOf('jingle-') === 0) {
            this.audio.stopMusic();
            if (this.resultVoice?.play(clip, CUES[this.track].gain, false)) this.resultRemaining = clip.getDuration();
        } else {
            this.audio.transitionMusic(clip, { fadeOutSeconds: fade, fadeInSeconds: fade,
                volumeScale: this.track === 'bgm-hangar' ? .55 : this.track === 'bgm-rage' ? .52 : .5 });
        }
        this.balanceVoices();
    }

    stopMusic(): void {
        this.track = '';
        this.resultRemaining = 0;
        this.resultVoice?.stop();
        this.audio.stopMusic();
    }

    pause(): void {
        if (this.paused) return;
        this.paused = true;
        this.stopCombatVoices();
        this.audio.pauseMusic();
    }
    resume(): void {
        if (!this.paused) return;
        this.paused = false;
        this.audio.resumeMusic();
    }

    endCombat(preserveCritical = false): void {
        this.combatEnabled = false;
        this.resume();
        this.stopCombatVoices(preserveCritical);
        this.duckUntil = this.shotBlockUntil = 0;
        this.duckTarget = this.duckGain = 1;
        this.headroomGain = 1;
        this.ambienceTime = 0;
        this.audio.setMusicGain(1);
    }

    private stopCombatVoices(preserveCritical = false): void {
        (['shot', 'impact', 'critical'] as SoundLane[]).forEach(lane => {
            if (preserveCritical && lane === 'critical') return;
            this.voices[lane].forEach(v => v.scope.stop());
        });
        Array.from(this.loops.keys()).forEach(id => this.stopLoop(id));
    }

    private touchLoop(id: string, key: string, gain: number, lifetime = Infinity): boolean {
        if (this.paused || this.disposed || !this.audio.isSoundEnabled || this.audio.isBackgroundPaused) return false;
        let voice = this.loops.get(id);
        const changed = voice?.key !== key || !voice.scope.playing;
        if (voice && voice.key !== key) this.stopLoop(id);
        voice = this.loops.get(id);
        if (!voice) {
            const scope = this.audio.createVoiceScope?.();
            if (!scope) return false;
            voice = { scope, key, gain, until: this.time + lifetime };
            this.loops.set(id, voice);
        }
        const clip = this.clips[key];
        if (!clip) { this.stopLoop(id); return false; }
        voice.key = key; voice.gain = gain; voice.until = this.time + lifetime;
        if (!voice.scope.playing && !voice.scope.play(clip, gain, true)) return false;
        voice.scope.setVolume(gain * (this.duckTarget < 1 ? .6 : 1));
        this.balanceVoices();
        return changed;
    }

    private stopLoop(id: string, ending = false): void {
        const voice = this.loops.get(id);
        if (!voice) return;
        this.loops.delete(id); voice.scope.dispose();
        if (ending && id === 'weapon') this.play(voice.key === 'laser-loop' ? 'laser-end' : 'breath-end');
    }

    /** 从模型当前状态恢复音乐与底声，兼容无尽续局、复活和 Boss 演出。 */
    syncCombat(c: SfCombat, live: boolean, dt = 0): void {
        if (this.disposed || !this.combatEnabled || this.paused || this.audio.isBackgroundPaused) return;
        const active = c.player.alive && c.phase !== 'exit' && c.phase !== 'clear' && c.phase !== 'done';
        if (!active) { Array.from(this.loops.keys()).forEach(id => this.stopLoop(id)); return; }
        const boss = !!c.boss;
        const rage = boss && c.boss!.phase >= 1;
        this.playMusic(boss ? rage ? 'bgm-rage' : 'bgm-boss' : 'bgm-battle');
        if (!this.audio.isSoundEnabled) { Array.from(this.loops.keys()).forEach(id => this.stopLoop(id)); return; }
        this.touchLoop('environment', `amb-ch${c.level.chapter}`, c.level.chapter === 3 ? .105 : .08);
        this.touchLoop('engine', boss ? rage ? 'amb-boss-rage' : 'amb-boss' : PLANE_AUDIO[c.config.plane].engine,
            boss ? .065 : .045 + Math.min(.025, Math.abs(c.player.vx) / 15000));
        if (!live) { this.stopLoop('weapon'); this.stopLoop('ultimate'); return; }
        if (c.ultimate) this.touchLoop('ultimate', 'ultimate-loop', .12);
        else this.stopLoop('ultimate');
        if (c.player.hp <= Math.max(1, Math.floor(c.player.maxHp * .25))) this.play('heartbeat');
        const previous = Math.floor(this.ambienceTime / 18);
        this.ambienceTime += dt;
        if (Math.floor(this.ambienceTime / 18) !== previous && !boss) {
            this.play(c.level.chapter === 3 ? 'thunder' : c.level.chapter === 1 ? 'seagull' : 'flyby');
        }
    }

    consume(events: CombatEvent[], plane: PlaneId): void {
        const weapon = PLANE_AUDIO[plane];
        // 先处理关键事件的让位，再派发这一模拟步的射击，避免同帧枪声盖住受伤或预警。
        const ordered = events.slice().sort((a, b) => (EVENT_PRIORITY[b.type] ?? 0) - (EVENT_PRIORITY[a.type] ?? 0));
        for (const e of ordered) {
            switch (e.type) {
                case 'shot':
                case 'weapon-fire':
                    if (e.kind === 'enemy') this.play('enemy-shot');
                    else if (e.slot === 'main') {
                        if (plane === 'dawn' || plane === 'dragon') {
                            if (this.touchLoop('weapon', plane === 'dawn' ? 'laser-loop' : 'breath-loop', .12, .32)) this.play(weapon.main);
                        } else this.play(weapon.main);
                    } else if (e.slot === 'wing') this.play(weapon.wing);
                    else if (e.slot === 'special') this.play(weapon.special);
                    break;
                case 'missile': this.play(plane === 'falcon' ? 'missile' : 'rocket'); break;
                case 'hit': this.play(e.kind === 'metal' ? 'hit-metal' : e.kind === 'wood' ? 'hit-wood' : 'hit-soft'); break;
                case 'shield-hit': this.play('shield-hit'); break;
                case 'kill': this.play((e.size ?? 1) <= 1 ? 'explo-s' : (e.size ?? 1) <= 3 ? 'explo-m' : 'explo-l'); break;
                case 'chain': this.play('chain'); break;
                case 'explosion':
                    if (e.kind === 'cancel') this.play('cancel');
                    else if (e.kind === 'keg' || e.kind === 'bomb') this.play('explo-m', .8);
                    break;
                case 'graze': this.play('graze'); break;
                case 'hurt': this.play('hurt'); break;
                case 'dead': this.stopLoop('weapon'); this.stopLoop('ultimate'); this.play('dead'); break;
                case 'revive': this.play('revive'); break;
                case 'assemble-start': this.play('pickup-part'); break;
                case 'assemble': this.play('assemble'); break;
                case 'part-full': this.play('part-full'); break;
                case 'part-lost': this.play('part-lost'); break;
                case 'fire-buff': this.play('buff'); break;
                case 'repair': this.play('repair'); break;
                case 'score': if ((e.coins ?? 0) > 0) this.play('pickup-coin', .8); break;
                case 'energy-full': this.play('ultimate-ready'); break;
                case 'ultimate': this.play('ultimate'); this.play(weapon.ultimate); this.touchLoop('ultimate', 'ultimate-loop', .12); break;
                case 'ultimate-end': this.stopLoop('ultimate'); this.play('ultimate-end'); break;
                case 'lock': this.play('lock'); break;
                case 'boss-warning': this.play('warning'); break;
                case 'boss-phase': this.play('boss-phase'); break;
                case 'boss-part': this.play('boss-part'); break;
                // Boss 主爆由机体销毁演出的实际爆炸时刻派发，不能在死亡事件时提前播放。
                case 'boss-defeated': this.duck(.48, .5); this.stopLoop('weapon'); this.stopLoop('ultimate'); break;
                case 'strike': this.play('thunder', .65); break;
            }
        }
    }

    stats(): object {
        const voices: Record<string, number> = {};
        (Object.keys(this.voices) as SoundLane[]).forEach(lane => { voices[lane] = this.voices[lane].filter(v => v.scope.playing).length; });
        return { loaded: Object.keys(this.clips).length, pending: this.pending.size, track: this.track,
            paused: this.paused, voices, loops: Array.from(this.loops.values()).map(v => v.key),
            resultPlaying: !!this.resultVoice?.playing, accepted: { ...this.accepted }, suppressed: this.suppressed, duckGain: this.duckGain };
    }

    dispose(): void {
        if (this.disposed) return;
        this.endCombat(); this.stopMusic();
        this.disposed = true;
        (Object.keys(this.voices) as SoundLane[]).forEach(lane => { this.voices[lane].forEach(v => v.scope.dispose()); this.voices[lane].length = 0; });
        this.resultVoice?.dispose();
        Object.keys(this.clips).forEach(key => delete this.clips[key]);
        this.pending.clear();
        this.audio.setMusicGain(1);
    }
}
