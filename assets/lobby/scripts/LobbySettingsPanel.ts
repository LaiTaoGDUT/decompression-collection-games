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
    overlay: new Color(42, 36, 31, 154),
    surface: new Color(255, 248, 231, 255),
    primary: new Color(54, 42, 34, 255),
    secondary: new Color(112, 94, 79, 255),
    border: new Color(174, 145, 110, 255),
    divider: new Color(224, 204, 170, 255),
    action: new Color(63, 107, 78, 255),
    sage: new Color(100, 132, 109, 255),
    disabled: new Color(190, 185, 173, 255),
    coral: new Color(238, 133, 103, 255),
    butter: new Color(246, 199, 84, 255),
    mint: new Color(218, 234, 221, 255),
    paper: new Color(255, 252, 245, 255),
    error: new Color(154, 67, 58, 255),
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
        this.createSettingsEntry(contentRoot);
        this.root = this.createPanel(contentRoot);
        this.root.active = false;
    }

    unmount(): void {
        this.rows.clear();
        this.root = null;
        this.services = undefined;
        this.errorLabel = undefined;
    }

    private createSettingsEntry(contentRoot: Node): void {
        const brand = contentRoot.getChildByName('BrandArea');
        if (!brand || brand.getChildByName('SettingsEntry')) {
            return;
        }

        const entry = new Node('SettingsEntry');
        entry.layer = brand.layer;
        brand.addChild(entry);
        entry.setPosition(286, -54);
        entry.addComponent(UITransform).setContentSize(88, 88);
        const graphics = entry.addComponent(Graphics);
        graphics.fillColor = new Color(58, 48, 38, 38);
        graphics.roundRect(-29, -33, 60, 60, 14);
        graphics.fill();
        graphics.fillColor = new Color(249, 211, 111, 255);
        graphics.strokeColor = COLOR.border;
        graphics.lineWidth = 2.5;
        graphics.roundRect(-31, -29, 60, 60, 14);
        graphics.fill();
        graphics.stroke();
        graphics.fillColor = COLOR.coral;
        graphics.roundRect(-31, -29, 6, 60, 3);
        graphics.fill();
        graphics.fillColor = new Color(255, 252, 245, 145);
        graphics.moveTo(9, 31);
        graphics.lineTo(29, 31);
        graphics.lineTo(29, 11);
        graphics.close();
        graphics.fill();
        graphics.strokeColor = COLOR.primary;
        graphics.lineWidth = 3.2;
        graphics.circle(-1, 1, 9);
        graphics.stroke();
        graphics.fillColor = COLOR.primary;
        graphics.circle(-1, 1, 3);
        graphics.fill();
        for (let index = 0; index < 8; index += 1) {
            const angle = index * Math.PI / 4;
            graphics.moveTo(-1 + Math.cos(angle) * 14, 1 + Math.sin(angle) * 14);
            graphics.lineTo(-1 + Math.cos(angle) * 20, 1 + Math.sin(angle) * 20);
        }
        graphics.stroke();

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
        panel.addComponent(UITransform).setContentSize(590, 540);
        const panelGraphics = panel.addComponent(Graphics);
        panelGraphics.fillColor = new Color(58, 48, 38, 42);
        panelGraphics.roundRect(-285, -280, 590, 540, 28);
        panelGraphics.fill();
        panelGraphics.fillColor = new Color(238, 133, 103, 235);
        panelGraphics.roundRect(-285, -260, 590, 540, 28);
        panelGraphics.fill();
        panelGraphics.fillColor = COLOR.surface;
        panelGraphics.strokeColor = COLOR.border;
        panelGraphics.lineWidth = 3;
        panelGraphics.roundRect(-295, -270, 590, 540, 28);
        panelGraphics.fill();
        panelGraphics.stroke();
        panelGraphics.fillColor = COLOR.mint;
        panelGraphics.roundRect(-295, 146, 590, 124, 28);
        panelGraphics.fill();
        panelGraphics.fillColor = COLOR.coral;
        panelGraphics.roundRect(-295, -270, 10, 540, 5);
        panelGraphics.fill();
        panelGraphics.fillColor = new Color(255, 252, 245, 155);
        panelGraphics.moveTo(228, 270);
        panelGraphics.lineTo(295, 270);
        panelGraphics.lineTo(295, 203);
        panelGraphics.close();
        panelGraphics.fill();
        panelGraphics.strokeColor = new Color(100, 132, 109, 100);
        panelGraphics.lineWidth = 2;
        panelGraphics.moveTo(228, 270);
        panelGraphics.lineTo(295, 203);
        panelGraphics.stroke();

        this.createLabel(panel, 'SettingsCollection', 'AMBIENCE  ·  COLLECTION CONTROL', -247, 231, 430, 24, 14, COLOR.sage);
        this.createLabel(panel, 'SettingsTitle', '声音与触感', -247, 192, 350, 48, 36, COLOR.primary);
        this.createLabel(panel, 'SettingsSubtitle', '把展厅调成你舒服的样子', -247, 156, 360, 28, 18, COLOR.secondary);
        this.createCloseButton(panel);
        this.createSettingRow(panel, 'music', '背景音乐', 86);
        this.createSettingRow(panel, 'sound', '互动音效', -20);
        this.createSettingRow(panel, 'vibration', '触感振动', -126);
        this.errorLabel = this.createLabel(
            panel,
            'SettingsError',
            '',
            -247,
            -231,
            494,
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
        node.setPosition(240, 214);
        node.addComponent(UITransform).setContentSize(88, 88);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = new Color(255, 252, 245, 230);
        graphics.strokeColor = COLOR.border;
        graphics.lineWidth = 2;
        graphics.roundRect(-30, -30, 60, 60, 16);
        graphics.fill();
        graphics.stroke();
        graphics.fillColor = COLOR.butter;
        graphics.circle(21, 21, 5);
        graphics.fill();
        graphics.strokeColor = COLOR.primary;
        graphics.lineWidth = 4;
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
        row.addComponent(UITransform).setContentSize(494, 92);
        const ticket = row.addComponent(Graphics);
        ticket.fillColor = new Color(58, 48, 38, 24);
        ticket.roundRect(-243, -49, 494, 92, 18);
        ticket.fill();
        ticket.fillColor = key === 'music'
            ? new Color(255, 239, 205, 255)
            : key === 'sound'
                ? new Color(232, 238, 224, 255)
                : new Color(239, 231, 219, 255);
        ticket.strokeColor = COLOR.divider;
        ticket.lineWidth = 2;
        ticket.roundRect(-247, -44, 494, 92, 18);
        ticket.fill();
        ticket.stroke();
        ticket.fillColor = key === 'music'
            ? COLOR.butter
            : key === 'sound' ? COLOR.sage : COLOR.coral;
        ticket.roundRect(-247, -44, 8, 92, 4);
        ticket.fill();

        const icon = new Node(`${key}Icon`);
        icon.layer = row.layer;
        row.addChild(icon);
        icon.setPosition(-207, 3);
        icon.addComponent(UITransform).setContentSize(60, 60);
        this.drawSettingIcon(icon.addComponent(Graphics), key);

        this.createLabel(row, `${key}Label`, title, -166, 8, 220, 38, 25, COLOR.primary);

        const switchNode = new Node(`${key}Switch`);
        switchNode.layer = row.layer;
        row.addChild(switchNode);
        switchNode.setPosition(184, 3);
        switchNode.addComponent(UITransform).setContentSize(116, 62);
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
            -38,
            0,
            76,
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
                -166,
                -20,
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
        graphics.fillColor = new Color(255, 252, 245, 230);
        graphics.strokeColor = COLOR.border;
        graphics.lineWidth = 2;
        graphics.circle(0, 0, 25);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = COLOR.primary;
        graphics.fillColor = COLOR.primary;
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
        row.track.fillColor = new Color(58, 48, 38, 28);
        row.track.roundRect(-56, -34, 116, 62, 31);
        row.track.fill();
        row.track.fillColor = !available
            ? COLOR.disabled
            : enabled ? COLOR.sage : new Color(151, 136, 120, 255);
        row.track.roundRect(-58, -30, 116, 62, 31);
        row.track.fill();
        row.track.strokeColor = new Color(255, 255, 255, 58);
        row.track.lineWidth = 2;
        row.track.roundRect(-54, -26, 108, 54, 27);
        row.track.stroke();

        const knobNode = row.knob.node;
        knobNode.setPosition(!available ? 0 : enabled ? 27 : -27, 1);
        row.knob.clear();
        row.knob.fillColor = new Color(58, 48, 38, 34);
        row.knob.circle(2, -3, 24);
        row.knob.fill();
        row.knob.fillColor = available ? COLOR.paper : new Color(224, 220, 211, 255);
        row.knob.strokeColor = COLOR.border;
        row.knob.lineWidth = 2;
        row.knob.circle(0, 0, 23);
        row.knob.fill();
        row.knob.stroke();

        row.valueLabel.string = !available ? '—' : enabled ? '开' : '关';
        row.valueLabel.color = Color.WHITE;
        row.valueLabel.node.setPosition(!available ? -23 : enabled ? -48 : 7, 0);
        row.valueLabel.node.getComponent(UITransform)?.setContentSize(46, 34);
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
