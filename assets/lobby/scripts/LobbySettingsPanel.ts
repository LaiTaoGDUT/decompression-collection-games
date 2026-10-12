import { setLabelBold } from '../../services/font/FontBinding';
import {
    assetManager,
    Button,
    BlockInputEvents,
    Color,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    Texture2D,
    tween,
    Tween,
    UITransform,
    Vec3,
    VerticalTextAlignment,
    view,
} from 'cc';
import type { Platform } from '../../platform/Platform';
import type { AudioService } from '../../services/audio/AudioService';
import type { FeedbackService } from '../../services/feedback/FeedbackService';
import type { StorageService } from '../../services/storage/StorageService';
import {
    LOBBY_HEADER_TOOL_CELL_HEIGHT,
    LOBBY_HEADER_TOOL_ICON_SIZE,
    LOBBY_HEADER_TOOLBAR_WIDTH,
} from '../../shared/ui/LobbyBrandLayout';
import { drawLobbyModalOverlay, LOBBY_MODAL_MOTION } from './LobbyModalMotion';
import { calculateVerticalSafeBounds } from '../../shared/ui/PlatformSafeLayout';

interface LobbySettingsServices {
    readonly audio: AudioService;
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
    readonly platform: Platform;
}

type SettingKey = 'music' | 'sound' | 'vibration';

interface SettingRow {
    readonly key: SettingKey;
    readonly button: Button;
    readonly track: Graphics;
    readonly knob: Graphics;
    readonly valueLabel: Label;
}

const COLOR = {
    overlay: new Color(37, 34, 66, 166),
    surface: new Color(255, 249, 237, 255),
    primary: new Color(91, 55, 42, 255),
    secondary: new Color(139, 102, 83, 255),
    border: new Color(248, 190, 143, 255),
    divider: new Color(250, 220, 190, 255),
    action: new Color(243, 112, 42, 255),
    disabled: new Color(211, 190, 177, 255),
    paper: new Color(255, 255, 255, 255),
    error: new Color(216, 78, 92, 255),
};

const UI_ASSET_PATHS = {
    settings: 'visual/ui/lobby-settings-icon/texture',
    close: 'visual/ui/lobby-close-button/texture',
    panel: 'visual/ui/lobby-settings-panel/texture',
    music: 'visual/ui/lobby-music-icon/texture',
    sound: 'visual/ui/lobby-sound-icon/texture',
    vibration: 'visual/ui/lobby-vibration-icon/texture',
} as const;

const SETTINGS_PANEL_WIDTH = 620;
const SETTINGS_PANEL_HEIGHT = 620;
const SETTINGS_PANEL_CORNER_RADIUS = 34;
const SETTINGS_CLOSE_SIZE = 64;
const SETTINGS_CLOSE_MARGIN = 20;

/** L1 settings UI. It only talks to public services and owns no game node. */
export class LobbySettingsPanel {
    private entry: Node | null = null;
    private root: Node | null = null;
    private panel: Node | null = null;
    private services?: LobbySettingsServices;
    private errorLabel?: Label;
    private readonly rows = new Map<SettingKey, SettingRow>();
    private readonly ownedFrames: SpriteFrame[] = [];
    private loadToken = 0;
    private transitionToken = 0;
    private readonly overlay = { opacity: 0 };
    private panelScale = 1;
    private opened = false;

    /** entrySlot 是大厅顶部栏左列的槽位，入口按设计尺寸挂在槽位中心。 */
    mount(overlayParent: Node, entrySlot: Node, services: LobbySettingsServices): void {
        if (this.root?.isValid) {
            this.services = services;
            this.refresh();
            return;
        }

        this.services = services;
        this.createSettingsEntry(entrySlot);
        this.root = this.createPanel(overlayParent);
        this.root.active = false;
        view.on('canvas-resize', this.layout, this);
    }

    unmount(): void {
        ++this.transitionToken;
        this.opened = false;
        view.off('canvas-resize', this.layout, this);
        Tween.stopAllByTarget(this.overlay);
        if (this.panel?.isValid) {
            Tween.stopAllByTarget(this.panel);
        }
        if (this.root?.isValid) {
            this.root.active = false;
            this.root.destroy();
        }
        if (this.entry?.isValid) {
            this.entry.active = false;
            this.entry.destroy();
        }
        this.rows.clear();
        this.entry = null;
        this.root = null;
        this.panel = null;
        this.services = undefined;
        this.errorLabel = undefined;
        this.loadToken += 1;
        this.ownedFrames.forEach((frame) => frame.destroy());
        this.ownedFrames.length = 0;
    }

    private createSettingsEntry(slot: Node): void {
        const entry = new Node('SettingsEntry');
        this.entry = entry;
        entry.layer = slot.layer;
        slot.addChild(entry);
        // 整格可点；图标画在顶部栏工具胶囊的上半格中央。
        entry.addComponent(UITransform).setContentSize(LOBBY_HEADER_TOOLBAR_WIDTH, LOBBY_HEADER_TOOL_CELL_HEIGHT);
        const skin = new Node('SettingsEntryIcon');
        skin.layer = entry.layer;
        entry.addChild(skin);
        skin.addComponent(UITransform).setContentSize(LOBBY_HEADER_TOOL_ICON_SIZE, LOBBY_HEADER_TOOL_ICON_SIZE);
        const sprite = skin.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.loadSprite(UI_ASSET_PATHS.settings, sprite);

        const button = entry.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.96;
        button.duration = 0.09;
        entry.on(Button.EventType.CLICK, this.open, this);
    }

    private createPanel(overlayParent: Node): Node {
        const root = new Node('SettingsModal');
        root.layer = overlayParent.layer;
        overlayParent.addChild(root);
        root.setSiblingIndex(overlayParent.children.length - 1);
        root.addComponent(UITransform).setContentSize(750, 1334);

        // Graphics only draws the dimmed backdrop; it does not participate in
        // Cocos' input blocking. Keep the modal's full-screen hit area active
        // so clicks and touches cannot reach the game cards underneath it.
        root.addComponent(BlockInputEvents);

        root.addComponent(Graphics);

        const panel = new Node('SettingsPanel');
        panel.layer = root.layer;
        root.addChild(panel);
        this.panel = panel;
        panel.addComponent(UITransform).setContentSize(SETTINGS_PANEL_WIDTH, SETTINGS_PANEL_HEIGHT);
        const panelGraphics = panel.addComponent(Graphics);
        panelGraphics.fillColor = COLOR.surface;
        panelGraphics.roundRect(
            -SETTINGS_PANEL_WIDTH / 2,
            -SETTINGS_PANEL_HEIGHT / 2,
            SETTINGS_PANEL_WIDTH,
            SETTINGS_PANEL_HEIGHT,
            SETTINGS_PANEL_CORNER_RADIUS,
        );
        panelGraphics.fill();
        const panelSkin = new Node('SettingsPanelSkin');
        panelSkin.layer = panel.layer;
        panel.addChild(panelSkin);
        panelSkin.setSiblingIndex(0);
        panelSkin.addComponent(UITransform).setContentSize(SETTINGS_PANEL_WIDTH, SETTINGS_PANEL_HEIGHT);
        const panelSprite = panelSkin.addComponent(Sprite);
        panelSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        panelSprite.type = Sprite.Type.SLICED;
        this.loadSprite(UI_ASSET_PATHS.panel, panelSprite, 30, 30, 68, 68, () => panelGraphics.clear());

        const title = this.createLabel(panel, 'SettingsTitle', '游戏设置', -175, 232, 350, 60, 49, COLOR.primary);
        title.horizontalAlign = HorizontalTextAlignment.CENTER;
        setLabelBold(title, true);
        const subtitle = this.createLabel(panel, 'SettingsSubtitle', '✦  声音与触感  ✦', -175, 174, 350, 38, 25, COLOR.secondary);
        subtitle.horizontalAlign = HorizontalTextAlignment.CENTER;
        this.createCloseButton(panel);
        this.createSettingRow(panel, 'music', '背景音乐', 92);
        this.createSettingRow(panel, 'sound', '游戏音效', -24);
        this.createSettingRow(panel, 'vibration', '震动反馈', -140);
        this.errorLabel = this.createLabel(
            panel,
            'SettingsError',
            '',
            -264,
            -260,
            528,
            34,
            22,
            COLOR.error,
        );
        this.errorLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        return root;
    }

    private createCloseButton(panel: Node): void {
        const node = new Node('SettingsClose');
        node.layer = panel.layer;
        panel.addChild(node);
        node.setPosition(
            SETTINGS_PANEL_WIDTH / 2 - SETTINGS_CLOSE_MARGIN - SETTINGS_CLOSE_SIZE / 2,
            SETTINGS_PANEL_HEIGHT / 2 - SETTINGS_CLOSE_MARGIN - SETTINGS_CLOSE_SIZE / 2,
        );
        node.addComponent(UITransform).setContentSize(SETTINGS_CLOSE_SIZE, SETTINGS_CLOSE_SIZE);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.loadSprite(UI_ASSET_PATHS.close, sprite);
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.92;
        button.duration = 0.09;
        node.on(Button.EventType.CLICK, this.close, this);
    }

    private createSettingRow(
        panel: Node,
        key: SettingKey,
        title: string,
        y: number,
    ): void {
        const row = new Node(`SettingRow-${key}`);
        row.layer = panel.layer;
        panel.addChild(row);
        row.setPosition(0, y);
        row.addComponent(UITransform).setContentSize(540, 104);
        const ticket = row.addComponent(Graphics);
        ticket.strokeColor = COLOR.divider;
        ticket.lineWidth = 2;
        ticket.moveTo(-270, -52);
        ticket.lineTo(270, -52);
        ticket.stroke();

        const icon = new Node(`${key}Icon`);
        icon.layer = row.layer;
        row.addChild(icon);
        icon.setPosition(-226, 0);
        icon.addComponent(UITransform).setContentSize(64, 64);
        const iconSprite = icon.addComponent(Sprite);
        iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.loadSprite(UI_ASSET_PATHS[key], iconSprite);

        const rowTitle = this.createLabel(row, `${key}Label`, title, -180, 3, 240, 46, 31, COLOR.primary);
        setLabelBold(rowTitle, true);

        const switchNode = new Node(`${key}Switch`);
        switchNode.layer = row.layer;
        row.addChild(switchNode);
        switchNode.setPosition(214, 0);
        switchNode.addComponent(UITransform).setContentSize(100, 54);
        const track = switchNode.addComponent(Graphics);
        const button = switchNode.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.96;
        button.duration = 0.09;
        const knobNode = new Node(`${key}Knob`);
        knobNode.layer = row.layer;
        switchNode.addChild(knobNode);
        knobNode.addComponent(UITransform).setContentSize(52, 52);
        const knob = knobNode.addComponent(Graphics);

        const valueLabel = this.createLabel(
            switchNode,
            `${key}Value`,
            '',
            -30,
            0,
            60,
            34,
            17,
            Color.WHITE,
        );
        valueLabel.horizontalAlign = HorizontalTextAlignment.CENTER;

        const settingRow: SettingRow = {
            key,
            button,
            track,
            knob,
            valueLabel,
        };
        this.rows.set(key, settingRow);
        switchNode.on(Button.EventType.CLICK, () => this.toggle(key));
    }

    private readonly open = (): void => {
        const root = this.root;
        const panel = this.panel;
        if (!root?.isValid || !panel?.isValid || this.opened) {
            return;
        }
        this.opened = true;
        const transitionToken = ++this.transitionToken;
        this.refresh();
        this.services?.feedback.vibrate('light');
        this.services?.feedback.play('popup');
        root.active = true;
        Tween.stopAllByTarget(panel);
        Tween.stopAllByTarget(this.overlay);
        this.overlay.opacity = 0;
        this.layout();
        panel.setScale(
            LOBBY_MODAL_MOTION.collapsedScaleX * this.panelScale,
            LOBBY_MODAL_MOTION.collapsedScaleY * this.panelScale,
            1,
        );
        tween(this.overlay)
            .to(LOBBY_MODAL_MOTION.openDuration, { opacity: 1 }, {
                easing: LOBBY_MODAL_MOTION.overlayOpenEasing,
                onUpdate: this.drawOverlay,
            })
            .start();
        tween(panel)
            .to(
                LOBBY_MODAL_MOTION.openDuration,
                { scale: new Vec3(this.panelScale, this.panelScale, 1) },
                { easing: LOBBY_MODAL_MOTION.openEasing },
            )
            .call(() => {
                if (transitionToken === this.transitionToken && panel.isValid) {
                    panel.setScale(this.panelScale, this.panelScale, 1);
                }
            })
            .start();
    };

    private readonly close = (): void => {
        const root = this.root;
        const panel = this.panel;
        if (!this.opened || !root?.isValid || !panel?.isValid) {
            return;
        }
        this.opened = false;
        ++this.transitionToken;
        this.services?.feedback.play('uiButton');
        Tween.stopAllByTarget(panel);
        Tween.stopAllByTarget(this.overlay);
        panel.setScale(this.panelScale, this.panelScale, 1);
        root.active = false;
    };

    private readonly drawOverlay = (): void => {
        const root = this.root;
        if (!root?.isValid) return;
        drawLobbyModalOverlay(root, COLOR.overlay, this.overlay.opacity);
    };

    private readonly layout = (): void => {
        const root = this.root;
        const panel = this.panel;
        const services = this.services;
        if (!root?.isValid || !panel?.isValid || !services) return;
        // 遮罩和触摸拦截覆盖整个屏幕；只有面板内容避让上下安全区。
        const size = view.getVisibleSize();
        const width = size.width || 750;
        const height = size.height || 1334;
        root.getComponent(UITransform)!.setContentSize(width, height);
        this.drawOverlay();
        const safe = calculateVerticalSafeBounds(height, services.platform.getLayoutInfo(), 12);
        this.panelScale = Math.max(0, Math.min(
            1,
            width / 750,
            (safe.topY - safe.bottomY - 24) / SETTINGS_PANEL_HEIGHT,
        ));
        Tween.stopAllByTarget(panel);
        panel.setPosition(0, (safe.topY + safe.bottomY) / 2);
        panel.setScale(this.panelScale, this.panelScale, 1);
    };

    private toggle(key: SettingKey): void {
        const services = this.services;
        if (!services || (key === 'vibration' && !services.platform.supportsVibration())) {
            return;
        }

        this.setError('');
        services.feedback.play('toggle');
        try {
            if (key === 'music') {
                const previous = services.audio.isMusicEnabled;
                try {
                    services.audio.setMusicEnabled(!previous);
                } catch (error) {
                    services.audio.setMusicEnabled(previous, false);
                    throw error;
                }
            } else if (key === 'sound') {
                const previous = services.audio.isSoundEnabled;
                try {
                    services.audio.setSoundEnabled(!previous);
                } catch (error) {
                    services.audio.setSoundEnabled(previous, false);
                    throw error;
                }
            } else {
                const enabled = services.storage.snapshot.settings.vibrationEnabled;
                services.feedback.setVibrationEnabled(!enabled);
            }
        } catch (error) {
            // TODO: console.error('[LobbySettingsPanel] Setting write failed.', error);
            this.setError('保存失败，请重试');
        }
        this.refresh();
    }

    private refresh(): void {
        const services = this.services;
        if (!services) {
            return;
        }
        const vibrationSupported = services.platform.supportsVibration();
        this.renderRow(this.rows.get('music'), services.audio.isMusicEnabled, true);
        this.renderRow(this.rows.get('sound'), services.audio.isSoundEnabled, true);
        this.renderRow(
            this.rows.get('vibration'),
            services.storage.snapshot.settings.vibrationEnabled,
            vibrationSupported,
        );
    }

    private renderRow(row: SettingRow | undefined, enabled: boolean, available: boolean): void {
        if (!row) {
            return;
        }
        row.button.interactable = available;
        const active = enabled && available;
        const activeColor = row.key === 'music'
            ? new Color(246, 91, 60, 255)
            : row.key === 'sound'
                ? new Color(55, 171, 172, 255)
                : new Color(161, 111, 68, 255);
        const activeBorder = row.key === 'music'
            ? new Color(196, 66, 43, 255)
            : row.key === 'sound'
                ? new Color(33, 132, 139, 255)
                : new Color(116, 75, 45, 255);
        row.track.clear();
        row.track.fillColor = new Color(87, 46, 31, 55);
        row.track.roundRect(-47, -29, 96, 50, 25);
        row.track.fill();
        row.track.fillColor = active
            ? activeColor
            : new Color(242, 224, 194, available ? 255 : 175);
        row.track.roundRect(-48, -25, 96, 50, 25);
        row.track.fill();
        row.track.strokeColor = active
            ? activeBorder
            : new Color(170, 142, 124, 180);
        row.track.lineWidth = 2;
        row.track.roundRect(-48, -25, 96, 50, 25);
        row.track.stroke();
        row.track.fillColor = new Color(255, 255, 255, active ? 72 : 100);
        row.track.roundRect(-36, 10, 66, 7, 3.5);
        row.track.fill();

        const knobNode = row.knob.node;
        knobNode.setPosition(active ? 23 : -23, 0);
        row.knob.clear();
        row.knob.fillColor = new Color(102, 55, 37, 74);
        row.knob.circle(1, -3, 22);
        row.knob.fill();
        row.knob.fillColor = available ? COLOR.paper : new Color(235, 225, 216, 255);
        row.knob.strokeColor = active ? activeBorder : new Color(171, 130, 100, 255);
        row.knob.lineWidth = 2;
        row.knob.circle(0, 0, 20.5);
        row.knob.fill();
        row.knob.stroke();
        row.knob.fillColor = new Color(255, 255, 255, 150);
        row.knob.circle(-5, 6, 6);
        row.knob.fill();

        row.valueLabel.string = '';
        row.valueLabel.node.active = false;
    }

    private setError(message: string): void {
        if (this.errorLabel) {
            this.errorLabel.string = message;
        }
    }

    private loadSprite(
        path: string,
        sprite: Sprite,
        insetLeft = 0,
        insetRight = 0,
        insetTop = 0,
        insetBottom = 0,
        onLoaded?: () => void,
    ): void {
        const bundle = assetManager.getBundle('lobby-covers');
        if (!bundle) return;
        const token = this.loadToken;
        bundle.load(path, Texture2D, (error: Error | null, texture: Texture2D) => {
            if (error || !texture || token !== this.loadToken || !sprite.node.isValid) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            frame.insetLeft = insetLeft;
            frame.insetRight = insetRight;
            frame.insetTop = insetTop;
            frame.insetBottom = insetBottom;
            this.ownedFrames.push(frame);
            sprite.spriteFrame = frame;
            onLoaded?.();
        });
    }

    private createLabel(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        width: number,
        height: number,
        fontSize: number,
        color: Color,
    ): Label {
        const node = new Node(name);
        node.layer = parent.layer;
        parent.addChild(node);
        node.setPosition(x, y);
        const transform = node.addComponent(UITransform);
        transform.setContentSize(width, height);
        transform.setAnchorPoint(0, 0.5);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = height;
        label.color = color;
        label.horizontalAlign = HorizontalTextAlignment.LEFT;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = false;
        return label;
    }
}
