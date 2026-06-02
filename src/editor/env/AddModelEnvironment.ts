import * as THREE from 'three';
import { Environment } from './Environment';
import { EnvironmentManager } from './EnvironmentManager';
import { AppViewer } from '../../app';

/**
 * 任何拥有 position 属性的模型都可以被 AddModelEnvironment 放置。
 */
export interface PositionableModel {
    position: THREE.Vector3;
}

/**
 * 模型添加环境。
 * 挂载后监听 mousemove 实时预览模型位置，点击确认放置并退回 normal 环境。
 * 按 Escape 取消放置。
 */
export class AddModelEnvironment implements Environment {
    readonly name = 'addModel';

    private viewer: AppViewer;
    private model: PositionableModel | null = null;

    private boundMouseMove: (e: MouseEvent) => void;
    private boundClick: (e: MouseEvent) => void;
    private boundKeyDown: (e: KeyboardEvent) => void;

    constructor(viewer: AppViewer) {
        this.viewer = viewer;
        this.boundMouseMove = this.onMouseMove.bind(this);
        this.boundClick = this.onClick.bind(this);
        this.boundKeyDown = this.onKeyDown.bind(this);
    }

    /**
     * 设置待放置的模型。必须在切换到该环境之前或之后调用。
     */
    setModel(model: PositionableModel): void {
        this.model = model;
    }

    mount(): void {
        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('click', this.boundClick, true);   // capture phase
        document.addEventListener('keydown', this.boundKeyDown);
        document.body.style.cursor = 'crosshair';
    }

    unmount(): void {
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('click', this.boundClick, true);
        document.removeEventListener('keydown', this.boundKeyDown);
        document.body.style.cursor = '';
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.model) return;

        const pos = this.viewer.getModelPosition(e.clientX, e.clientY, this.model.position.z);
        if (pos) {
            this.model.position = pos;
        }
    }

    private onClick(_e: MouseEvent): void {
        // 确认位置，退回 normal 环境
        EnvironmentManager.getInstance().switchTo('normal');
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            // 取消放置，退回 normal 环境
            EnvironmentManager.getInstance().switchTo('normal');
        }
    }
}
