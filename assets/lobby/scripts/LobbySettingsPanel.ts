import {
    Button,
    Color,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Node,
    UITransform,
    VerticalTextAlignment,
    Widget,
} from 'cc';
import type { Platform } from '../../platform/Platform';
import type { AudioService } from '../../services/audio/AudioService';
import type { FeedbackService } from '../../services/feedback/FeedbackService';
import type { StorageService } from '../../services/storage/StorageService';

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
    readonly unavailableLabel?: Label;
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

/** L1 settings UI. It only talks to public services and owns no game node. */
export class LobbySettingsPanel {
    private root: Node | null = null;
    private services?: LobbySettingsServices;
    private errorLabel?: Label;
    private readonly rows = new Map<SettingKey, SettingRow>();

    mount(contentRoot: Node, services: LobbySettingsServices): void {
        if (this.root?.isValid) {
            this.services = services;
            this.refresh();
            return;
        }

        this.services = services;
        this.createSettingsEntry(contentRoot, services);
        this.root = this.createPanel(contentRoot);
        this.root.active = false;
    }

    unmount(): void {
        this.rows.clear();
        this.root = null;
        this.services = undefined;
        this.errorLabel = undefined;
    }

    private createSettingsEntry(
        contentRoot: Node,
        services: LobbySettingsServices,
    ): void {
        if (contentRoot.getChildByName('SettingsEntry')) {
            return;
        }

        const entry = new Node('SettingsEntry');
        entry.layer = contentRoot.layer;
        contentRoot.addChild(entry);
        entry.addComponent(UITransform).setContentSize(92, 92);
        const widget = entry.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignRight = true;
        const layout = services.platform.getLayoutInfo();
        const capsuleBottom = layout.topRightReservedArea?.bottom ?? 0;
        const capsuleInset = Math.max(
            0,
            capsuleBottom - layout.safeArea.top + 12,
        );
        widget.top = Math.max(36, capsuleInset);
        widget.right = 37;
        widget.updateAlignment();
        const graphics = entry.addComponent(Graphics);
        graphics.fillColor = new Color(12, 37, 149, 145);
        graphics.circle(3, -6, 39);
        graphics.fill();
        graphics.fillColor = new Color(41, 118, 250, 255);
        graphics.strokeColor = new Color(211, 243, 255, 255);
        graphics.lineWidth = 4;
        graphics.circle(0, 0, 37);
        graphics.fill();
        graphics.stroke();
        graphics.fillColor = new Color(105, 205, 255, 255);
        graphics.circle(0, 0, 29);
        graphics.fill();
        graphics.fillColor = Color.WHITE;
        for (let index = 0; index < 32; index += 1) {
            const angle = -Math.PI / 2 + index * Math.PI / 16;
            const radius = index % 4 < 2 ? 20 : 15;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            if (index === 0) {
                graphics.moveTo(x, y);
            } else {
                graphics.lineTo(x, y);
            }
        }
        graphics.close();
        graphics.fill();
        graphics.fillColor = new Color(42, 121, 238, 255);
        graphics.circle(0, 0, 7);
        graphics.fill();

        const button = entry.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.96;
        button.duration = 0.09;
        entry.on(Button.EventType.CLICK, this.open, this);
    }

    private createPanel(contentRoot: Node): Node {
        const root = new Node('SettingsModal');
        root.layer = contentRoot.layer;
        contentRoot.addChild(root);
        root.setSiblingIndex(contentRoot.children.length - 1);
        root.addComponent(UITransform).setContentSize(750, 1334);
        const widget = root.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.top = 0;
        widget.bottom = 0;
        widget.left = 0;
        widget.right = 0;

        const overlay = root.addComponent(Graphics);
        overlay.fillColor = COLOR.overlay;
        overlay.rect(-500, -1000, 1000, 2000);
        overlay.fill();

        const panel = new Node('SettingsPanel');
        panel.layer = root.layer;
        root.addChild(panel);
        panel.addComponent(UITransform).setContentSize(560, 560);
        const panelGraphics = panel.addComponent(Graphics);
        panelGraphics.fillColor = new Color(70, 43, 38, 58);
        panelGraphics.roundRect(-274, -292, 560, 560, 34);
        panelGraphics.fill();
        panelGraphics.fillColor = COLOR.surface;
        panelGraphics.strokeColor = new Color(255, 255, 255, 255);
        panelGraphics.lineWidth = 3;
        panelGraphics.roundRect(-280, -280, 560, 560, 34);
        panelGraphics.fill();
        panelGraphics.stroke();
        panelGraphics.fillColor = new Color(246, 113, 49, 255);
        panelGraphics.roundRect(-54, 164, 108, 7, 4);
        panelGraphics.fill();
        panelGraphics.fillColor = new Color(255, 205, 85, 255);
        panelGraphics.circle(-70, 167, 4);
        panelGraphics.circle(70, 167, 4);
        panelGraphics.fill();

        const title = this.createLabel(panel, 'SettingsTitle', '游戏设置', -150, 220, 300, 48, 34, COLOR.primary);
        title.horizontalAlign = HorizontalTextAlignment.CENTER;
        const subtitle = this.createLabel(panel, 'SettingsSubtitle', '声音与触感', -120, 140, 240, 30, 20, COLOR.secondary);
        subtitle.horizontalAlign = HorizontalTextAlignment.CENTER;
        this.createCloseButton(panel);
        this.createSettingRow(panel, 'music', '背景音乐', 70);
        this.createSettingRow(panel, 'sound', '互动音效', -30);
        this.createSettingRow(panel, 'vibration', '触感振动', -130);
        this.errorLabel = this.createLabel(
            panel,
            'SettingsError',
            '',
            -230,
            -230,
            460,
            34,
            20,
            COLOR.error,
        );
        this.errorLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        return root;
    }

    private createCloseButton(panel: Node): void {
        const node = new Node('SettingsClose');
        node.layer = panel.layer;
        panel.addChild(node);
        node.setPosition(224, 220);
        node.addComponent(UITransform).setContentSize(72, 72);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = new Color(91, 55, 42, 42);
        graphics.circle(1, -3, 27);
        graphics.fill();
        graphics.fillColor = new Color(255, 238, 220, 255);
        graphics.strokeColor = new Color(248, 190, 143, 255);
        graphics.lineWidth = 2;
        graphics.circle(0, 0, 26);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(210, 91, 49, 255);
        graphics.lineWidth = 3;
        graphics.moveTo(-12, -12);
        graphics.lineTo(12, 12);
        graphics.moveTo(-12, 12);
        graphics.lineTo(12, -12);
        graphics.stroke();
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
        row.addComponent(UITransform).setContentSize(460, 82);
        const ticket = row.addComponent(Graphics);
        ticket.fillColor = new Color(255, 255, 255, 255);
        ticket.strokeColor = COLOR.border;
        ticket.lineWidth = 3;
        ticket.roundRect(-230, -41, 460, 82, 20);
        ticket.fill();
        ticket.stroke();

        const icon = new Node(`${key}Icon`);
        icon.layer = row.layer;
        row.addChild(icon);
        icon.setPosition(-190, 0);
        icon.addComponent(UITransform).setContentSize(60, 60);
        this.drawSettingIcon(icon.addComponent(Graphics), key);

        this.createLabel(row, `${key}Label`, title, -150, 5, 220, 38, 24, COLOR.primary);

        const switchNode = new Node(`${key}Switch`);
        switchNode.layer = row.layer;
        row.addChild(switchNode);
        switchNode.setPosition(174, 0);
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

        let unavailableLabel: Label | undefined;
        if (key === 'vibration') {
            unavailableLabel = this.createLabel(
                row,
                'VibrationUnavailable',
                '',
                -150,
                -19,
                310,
                24,
                15,
                COLOR.secondary,
            );
        }

        const settingRow: SettingRow = {
            key,
            button,
            track,
            knob,
            valueLabel,
            unavailableLabel,
        };
        this.rows.set(key, settingRow);
        switchNode.on(Button.EventType.CLICK, () => this.toggle(key));
    }

    private drawSettingIcon(graphics: Graphics, key: SettingKey): void {
        graphics.fillColor = new Color(255, 211, 74, 255);
        graphics.strokeColor = new Color(245, 132, 34, 255);
        graphics.lineWidth = 3;
        graphics.circle(0, 0, 25);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = COLOR.action;
        graphics.fillColor = COLOR.action;
        graphics.lineWidth = 4;

        if (key === 'music') {
            graphics.moveTo(-3, 12);
            graphics.lineTo(-3, -9);
            graphics.lineTo(13, -5);
            graphics.lineTo(13, 15);
            graphics.stroke();
            graphics.circle(-10, -11, 6);
            graphics.circle(6, -7, 6);
            graphics.fill();
        } else if (key === 'sound') {
            graphics.moveTo(-14, -7);
            graphics.lineTo(-6, -7);
            graphics.lineTo(5, -16);
            graphics.lineTo(5, 16);
            graphics.lineTo(-6, 7);
            graphics.lineTo(-14, 7);
            graphics.close();
            graphics.fill();
            graphics.moveTo(10, -8);
            graphics.bezierCurveTo(18, -4, 18, 4, 10, 8);
            graphics.stroke();
        } else {
            graphics.roundRect(-9, -15, 18, 30, 5);
            graphics.stroke();
            graphics.moveTo(-15, -12);
            graphics.lineTo(-20, -6);
            graphics.lineTo(-15, 0);
            graphics.lineTo(-20, 6);
            graphics.lineTo(-15, 12);
            graphics.moveTo(15, -12);
            graphics.lineTo(20, -6);
            graphics.lineTo(15, 0);
            graphics.lineTo(20, 6);
            graphics.lineTo(15, 12);
            graphics.stroke();
        }
    }

    private readonly open = (): void => {
        if (!this.root) {
            return;
        }
        this.refresh();
        this.services?.feedback.vibrate('light');
        this.services?.feedback.play('popup');
        this.root.active = true;
    };

    private readonly close = (): void => {
        if (this.root) {
            this.services?.feedback.play('uiButton');
            this.root.active = false;
        }
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
            console.error('[LobbySettingsPanel] Setting write failed.', error);
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
        row.track.clear();
        row.track.fillColor = !available
            ? COLOR.disabled
            : enabled ? COLOR.action : new Color(224, 207, 192, 255);
        row.track.roundRect(-48, -25, 96, 50, 25);
        row.track.fill();
        row.track.strokeColor = enabled && available
            ? new Color(194, 70, 34, 255)
            : new Color(170, 142, 124, 180);
        row.track.lineWidth = 1.5;
        row.track.roundRect(-48, -25, 96, 50, 25);
        row.track.stroke();

        const knobNode = row.knob.node;
        knobNode.setPosition(!available ? 0 : enabled ? 23 : -23, 0);
        row.knob.clear();
        row.knob.fillColor = new Color(102, 55, 37, 40);
        row.knob.circle(1, -2, 21);
        row.knob.fill();
        row.knob.fillColor = available ? COLOR.paper : new Color(235, 225, 216, 255);
        row.knob.circle(0, 0, 20);
        row.knob.fill();

        row.valueLabel.string = '';
        row.valueLabel.node.active = false;
        if (row.unavailableLabel) {
            row.unavailableLabel.string = available ? '' : '当前平台不支持振动';
        }
    }

    private setError(message: string): void {
        if (this.errorLabel) {
            this.errorLabel.string = message;
        }
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
