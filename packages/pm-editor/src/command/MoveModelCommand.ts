import * as THREE from 'three';
import type { Scene3D } from '../Scene3D';

/**
 * 命令接口（与 editor/Command 保持一致）
 */
export interface Command {
    readonly name: string;
    onExecute(): void;
    onComplete(): void;
}

/**
 * MoveModelCommand for pm-editor.
 *
 * After a group is selected in Scene3D, this command lets the user
 * drag the group on the horizontal XZ plane at its current Y height.
 *
 * Usage:
 *   const cmd = new MoveModelCommand(scene3d);
 *   cmd.setTarget(group, clientX, clientY);
 *   cmd.onExecute();       // starts listening
 *   // ... pointer events drive the drag ...
 *   cmd.onComplete();      // cleans up (called automatically on pointerup)
 */
export class MoveModelCommand implements Command {
    readonly name = 'moveModel';

    private scene3d: Scene3D;

    // Drag state
    private target: THREE.Group | null = null;
    private dragOffset: THREE.Vector3 | null = null;
    private pointerDown = new THREE.Vector2();
    private isDragging = false;

    /** Called each frame the target position changes during drag */
    onPositionChange: ((target: THREE.Group) => void) | null = null;

    // Reusable math objects
    private static _raycaster = new THREE.Raycaster();
    private static _mouse = new THREE.Vector2();
    private static _plane = new THREE.Plane();
    private static _intersection = new THREE.Vector3();

    private boundPointerMove: (e: PointerEvent) => void;
    private boundPointerUp: (e: PointerEvent) => void;

    constructor(scene3d: Scene3D) {
        this.scene3d = scene3d;
        this.boundPointerMove = this.onPointerMove.bind(this);
        this.boundPointerUp = this.onPointerUp.bind(this);
    }

    /**
     * Set the group to be moved. Must be called before onExecute.
     * Computes the initial drag offset from the pointer position.
     */
    setTarget(group: THREE.Group, clientX: number, clientY: number): void {
        this.target = group;
        this.isDragging = false;
        this.pointerDown.set(clientX, clientY);

        const canvas = this.getCanvas();
        const camera = this.scene3d.getCamera();
        if (!canvas || !camera) return;

        const rect = canvas.getBoundingClientRect();
        this.dragOffset = this.computeOffset(
            group.position,
            clientX - rect.left,
            clientY - rect.top,
            rect.width,
            rect.height,
            camera,
        );
    }

    /** Whether the user actually dragged (beyond threshold) */
    get wasDragged(): boolean {
        return this.isDragging;
    }

    onExecute(): void {
        const canvas = this.getCanvas();
        if (!canvas) return;

        // Disable orbit controls while dragging
        this.scene3d.getControls().enabled = false;

        canvas.addEventListener('pointermove', this.boundPointerMove);
        canvas.addEventListener('pointerup', this.boundPointerUp);
    }

    onComplete(): void {
        const canvas = this.getCanvas();
        if (canvas) {
            canvas.removeEventListener('pointermove', this.boundPointerMove);
            canvas.removeEventListener('pointerup', this.boundPointerUp);
        }

        // Re-enable orbit controls
        this.scene3d.getControls().enabled = true;

        this.target = null;
        this.dragOffset = null;
        this.isDragging = false;
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    private onPointerMove(e: PointerEvent): void {
        if (!this.target || !this.dragOffset) return;

        const canvas = this.getCanvas();
        const camera = this.scene3d.getCamera();
        if (!canvas || !camera) return;

        const rect = canvas.getBoundingClientRect();
        const pxX = e.clientX - rect.left;
        const pxY = e.clientY - rect.top;

        // Check if pointer is still over the target group's meshes
        if (!this.isPointerOverTarget(pxX, pxY, rect.width, rect.height, camera)) {
            this.onComplete();
            return;
        }

        // 3px drag threshold
        if (!this.isDragging) {
            if (Math.abs(e.clientX - this.pointerDown.x) > 3 || Math.abs(e.clientY - this.pointerDown.y) > 3) {
                this.isDragging = true;
            } else {
                return;
            }
        }

        const newPos = this.computePositionWithOffset(
            this.dragOffset,
            this.target.position,
            pxX,
            pxY,
            rect.width,
            rect.height,
            camera,
        );
        if (newPos) {
            this.target.position.copy(newPos);
            this.onPositionChange?.(this.target);
        }
    }

    private onPointerUp(_e: PointerEvent): void {
        this.onComplete();
    }

    /**
     * Raycast onto the horizontal plane at `modelY` and return the offset
     * between the hit point and the model origin.
     */
    private computeOffset(
        modelPos: THREE.Vector3,
        pxX: number, pxY: number,
        w: number, h: number,
        camera: THREE.PerspectiveCamera,
    ): THREE.Vector3 | null {
        const hit = this.rayHitOnPlane(modelPos, pxX, pxY, w, h, camera);
        if (!hit) return null;
        // offset = hit - modelPos  (so modelPos = hit - offset later)
        return hit.clone().sub(modelPos);
    }

    /**
     * Compute new model position: worldHit - offset.
     */
    private computePositionWithOffset(
        offset: THREE.Vector3,
        modelPos: THREE.Vector3,
        pxX: number, pxY: number,
        w: number, h: number,
        camera: THREE.PerspectiveCamera,
    ): THREE.Vector3 | null {
        const hit = this.rayHitOnPlane(modelPos, pxX, pxY, w, h, camera);
        if (!hit) return null;
        return hit.sub(offset);
    }

    /**
     * Intersect the camera ray with the horizontal plane (Y = modelPos.y).
     */
    private rayHitOnPlane(
        modelPos: THREE.Vector3,
        pxX: number, pxY: number,
        w: number, h: number,
        camera: THREE.PerspectiveCamera,
    ): THREE.Vector3 | null {
        MoveModelCommand._mouse.set(
            (pxX / w) * 2 - 1,
            -(pxY / h) * 2 + 1,
        );
        MoveModelCommand._raycaster.setFromCamera(MoveModelCommand._mouse, camera);

        // Horizontal plane at model's Y height (Three.js Y-up)
        MoveModelCommand._plane.set(new THREE.Vector3(0, 1, 0), -modelPos.y);

        if (!MoveModelCommand._raycaster.ray.intersectPlane(MoveModelCommand._plane, MoveModelCommand._intersection)) {
            return null;
        }
        return MoveModelCommand._intersection.clone();
    }

    private getCanvas(): HTMLCanvasElement | null {
        return this.scene3d.getRenderer().domElement ?? null;
    }

    /**
     * Raycast from the pointer position and check if any mesh
     * in the target group is hit.
     */
    private isPointerOverTarget(
        pxX: number, pxY: number,
        w: number, h: number,
        camera: THREE.PerspectiveCamera,
    ): boolean {
        if (!this.target) return false;

        MoveModelCommand._mouse.set(
            (pxX / w) * 2 - 1,
            -(pxY / h) * 2 + 1,
        );
        MoveModelCommand._raycaster.setFromCamera(MoveModelCommand._mouse, camera);

        const meshes: THREE.Mesh[] = [];
        this.target.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                meshes.push(child);
            }
        });

        const hits = MoveModelCommand._raycaster.intersectObjects(meshes, false);
        return hits.length > 0;
    }
}
