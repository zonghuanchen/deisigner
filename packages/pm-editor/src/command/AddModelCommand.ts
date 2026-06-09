import * as THREE from 'three';
import type { Scene3D } from '../Scene3D';
import type { Command } from './MoveModelCommand';

/**
 * 参数化实体添加命令。
 *
 * 执行后在场景中显示待放置实体的预览（ghost），跟随鼠标在地面（Y=0）上移动。
 * 点击确认放置，按 Escape 取消。两者均通过 onComplete 结束命令。
 *
 * 用法：
 *   const cmd = new AddModelCommand(scene3d);
 *   cmd.setGhost(ghostGroup);
 *   cmd.onConfirm = (pos) => { ... };
 *   cmd.onCancel = () => { ... };
 *   cmd.onExecute();
 */
export class AddModelCommand implements Command {
    readonly name = 'addModel';

    private scene3d: Scene3D;
    private ghost: THREE.Group | null = null;

    /** 确认放置后触发，参数为最终世界坐标（Three.js Y-up） */
    onConfirm: ((position: THREE.Vector3) => void) | null = null;
    /** 取消放置后触发 */
    onCancel: (() => void) | null = null;

    private boundMouseMove: (e: MouseEvent) => void;
    private boundClick: (e: MouseEvent) => void;
    private boundKeyDown: (e: KeyboardEvent) => void;

    private static _raycaster = new THREE.Raycaster();
    private static _mouse = new THREE.Vector2();
    private static _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    private static _intersection = new THREE.Vector3();

    constructor(scene3d: Scene3D) {
        this.scene3d = scene3d;
        this.boundMouseMove = this.onMouseMove.bind(this);
        this.boundClick = this.onClick.bind(this);
        this.boundKeyDown = this.onKeyDown.bind(this);
    }

    /**
     * 设置预览 ghost。必须在 onExecute 之前调用。
     * ghost 会被添加到场景中并跟随鼠标移动。
     */
    setGhost(ghost: THREE.Group): void {
        this.ghost = ghost;
    }

    onExecute(): void {
        if (this.ghost) {
            this.scene3d.getRootGroup().add(this.ghost);
        }
        this.scene3d.getControls().enabled = false;

        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('click', this.boundClick, true);
        document.addEventListener('keydown', this.boundKeyDown);
        document.body.style.cursor = 'crosshair';
    }

    onComplete(): void {
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('click', this.boundClick, true);
        document.removeEventListener('keydown', this.boundKeyDown);
        document.body.style.cursor = '';

        this.scene3d.getControls().enabled = true;

        if (this.ghost) {
            if (this.ghost.parent) {
                this.ghost.parent.remove(this.ghost);
            }
            this.ghost = null;
        }
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.ghost) return;

        const canvas = this.scene3d.getRenderer().domElement;
        const camera = this.scene3d.getCamera();
        const rect = canvas.getBoundingClientRect();

        AddModelCommand._mouse.set(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        AddModelCommand._raycaster.setFromCamera(AddModelCommand._mouse, camera);

        if (AddModelCommand._raycaster.ray.intersectPlane(
            AddModelCommand._plane,
            AddModelCommand._intersection,
        )) {
            const hit = AddModelCommand._intersection;
            // Convert world Y-up hit → Z-up local: (x, y, z) → (x, -z, y)
            this.ghost.position.set(hit.x, -hit.z, hit.y);
        }
    }

    private onClick(e: MouseEvent): void {
        e.stopPropagation();
        const position = this.ghost ? this.ghost.position.clone() : new THREE.Vector3();
        this.onComplete();
        this.onConfirm?.(position);
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            this.onComplete();
            this.onCancel?.();
        }
    }
}
