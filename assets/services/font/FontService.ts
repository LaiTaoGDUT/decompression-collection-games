import { Component, Director, director, Font, JsonAsset, Label, Node } from 'cc';
import type { AssetService } from '../asset/AssetService';
import { FontBinding, type AppFontPalette } from './FontBinding';

export const SHARED_FONT_BUNDLE = 'shared-fonts';

export interface FontSettings {
    readonly enabled: boolean;
    readonly loadTimeoutMs: number;
}

/** 应用级字体资源和节点绑定所有者；关闭时完全不加载、不监听、不应用。 */
export class FontService {
    private initialization?: Promise<void>;
    private disposed = false;
    private palette?: AppFontPalette;
    private readonly watched = new Map<Node, () => void>();
    private readonly bindings = new Set<FontBinding>();

    constructor(private readonly assets: AssetService) {}

    get isReady(): boolean { return !!this.palette; }

    initialize(settings: FontSettings): Promise<void> {
        if (this.disposed || !settings.enabled) return Promise.resolve();
        if (!this.initialization) this.initialization = this.load(settings.loadTimeoutMs);
        return this.initialization;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        director.off(Director.EVENT_AFTER_SCENE_LAUNCH, this.attachScene, this);
        this.clearBindings();
        this.palette = undefined;
        if (this.initialization) this.releaseBundle();
    }

    private async load(timeoutMs: number): Promise<void> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const bundle = await Promise.race([
                this.assets.prepareBundle(SHARED_FONT_BUNDLE, 'fonts'),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error('Font loading timed out.')), timeoutMs);
                }),
            ]);
            if (this.disposed) return;
            const regular = bundle.get('fonts/regular', Font);
            const bold = bundle.get('fonts/bold', Font);
            const coverage = bundle.get('fonts/coverage', JsonAsset)?.json?.characters;
            if (!regular || !bold || typeof coverage !== 'string' || !coverage.length) {
                throw new Error('Incomplete shared font bundle.');
            }
            // Creator 3.8.8 reports successful TTF parsing with "Arial" when
            // platform registration fails. A Font asset alone is not proof of
            // registration; our real weights also need separate families.
            const regularFamily = regular._nativeAsset;
            const boldFamily = bold._nativeAsset;
            if (typeof regularFamily !== 'string' || !regularFamily.trim() || regularFamily === 'Arial'
                || typeof boldFamily !== 'string' || !boldFamily.trim() || boldFamily === 'Arial'
                || regularFamily === boldFamily) {
                throw new Error(`Shared font registration failed: regular=${String(regularFamily)}, bold=${String(boldFamily)}.`);
            }
            this.palette = { regular, bold, characters: new Set(Array.from(coverage, c => c.codePointAt(0)!)) };
            director.on(Director.EVENT_AFTER_SCENE_LAUNCH, this.attachScene, this);
            this.attachScene();
        } catch (error: unknown) {
            // 字体属于增强表现，失败时仍允许大厅和游戏使用系统字体。
            console.warn('[FontService] Using system fonts.', error);
            this.releaseBundle();
        } finally {
            if (timer !== undefined) clearTimeout(timer);
        }
    }

    private releaseBundle(): void {
        void this.assets.releaseBundle(SHARED_FONT_BUNDLE).catch((error: unknown) => {
            console.warn('[FontService] Font bundle release failed.', error);
        });
    }

    private readonly attachScene = (): void => {
        this.clearBindings();
        const scene = director.getScene();
        if (scene && this.palette && !this.disposed) this.watch(scene);
    };

    private watch(node: Node): void {
        if (this.watched.has(node) || !node.isValid || !this.palette) return;
        const add = (child: Node): void => this.watch(child);
        const remove = (child: Node): void => this.unwatch(child);
        const componentAdded = (component: Component): void => {
            if (component instanceof Label) this.bind(component);
        };
        const componentRemoved = (component: Component): void => {
            if (component instanceof FontBinding) this.bindings.delete(component);
            if (component instanceof Label) {
                const binding = node.getComponent(FontBinding);
                if (binding) { binding.unbind(); this.bindings.delete(binding); }
            }
        };
        const destroyed = (): void => this.unwatch(node);
        node.on(Node.EventType.CHILD_ADDED, add);
        node.on(Node.EventType.CHILD_REMOVED, remove);
        node.on(Node.EventType.COMPONENT_ADDED, componentAdded);
        node.on(Node.EventType.COMPONENT_REMOVED, componentRemoved);
        node.on(Node.EventType.NODE_DESTROYED, destroyed);
        this.watched.set(node, () => {
            node.off(Node.EventType.CHILD_ADDED, add);
            node.off(Node.EventType.CHILD_REMOVED, remove);
            node.off(Node.EventType.COMPONENT_ADDED, componentAdded);
            node.off(Node.EventType.COMPONENT_REMOVED, componentRemoved);
            node.off(Node.EventType.NODE_DESTROYED, destroyed);
        });
        node.getComponents(Label).forEach(label => this.bind(label));
        node.children.forEach(child => this.watch(child));
    }

    private bind(label: Label): void {
        if (!this.palette) return;
        const binding = label.node.getComponent(FontBinding) ?? label.node.addComponent(FontBinding);
        binding.bind(label, this.palette);
        this.bindings.add(binding);
    }

    private unwatch(node: Node): void {
        this.watched.get(node)?.();
        this.watched.delete(node);
        const binding = node.getComponent(FontBinding);
        if (binding) { binding.unbind(); this.bindings.delete(binding); }
        node.children.forEach(child => this.unwatch(child));
    }

    private clearBindings(): void {
        this.watched.forEach(unsubscribe => unsubscribe());
        this.watched.clear();
        this.bindings.forEach(binding => { if (binding.isValid) binding.unbind(); });
        this.bindings.clear();
    }
}
