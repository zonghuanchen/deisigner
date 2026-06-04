import * as THREE from 'three';
import { Command } from './Command';
import { CommandManager } from './CommandManager';
import { AppViewer } from '../../app';
import { FurnitureModel } from '../../core/model/FurnitureModel';
import { FurnitureType } from '../../core/types';
import { computeDragOffset, computeDragPositionWithOffset } from '../../app/3d/util/dragHelper';
import { Scene3DManager } from '../../app/3d/Scene3DManager';

/** Model types that support ordinary drag-to-move (normal FurnitureModel only) */
type DraggableModel = FurnitureModel;

/** Type guard: ordinary (non-host) furniture models */
function isDraggable(model: any): model is DraggableModel {
    return model instanceof FurnitureModel && model.modelType === FurnitureType.Normal;
}

/** Type guard: host models (door, window) that require MoveHostModelCommand */
function isHostModel(model: any): model is FurnitureModel {
    return model instanceof FurnitureModel && (model.modelType === FurnitureType.Door || model.modelType === FurnitureType.Window);
}

/**
 * Move model command.
 * Activated when a draggable model is selected. Listens for pointer events
 * on the canvas and drags the model on the horizontal plane at its current height.
 * The command stays active until explicitly completed.
 */
export class MoveModelCommand implements Command {
    readonly name = 'moveModel';

    private viewer: AppViewer;

    // Drag state
    private model: DraggableModel | null = null;
    private dragOffset: THREE.Vector3 | null = null;
    private pointerDown = new THREE.Vector2();
    private isDragging = false;

    private boundPointerMove: (e: PointerEvent) => void;
    private boundPointerUp: (e: PointerEvent) => void;

    constructor(viewer: AppViewer) {
        this.viewer = viewer;
        this.boundPointerMove = this.onPointerMove.bind(this);
        this.boundPointerUp = this.onPointerUp.bind(this);
    }

    /**
     * Sets the model to be moved. Must be called before execute.
     * Computes the initial drag offset from the current pointer position.
     *
     * @param model    The draggable model
     * @param clientX  Pointer X at selection time (viewport-relative)
     * @param clientY  Pointer Y at selection time (viewport-relative)
     */
    setModel(model: DraggableModel, clientX: number, clientY: number): void {
        this.model = model;
        this.isDragging = false;
        this.pointerDown.set(clientX, clientY);

        const canvas = this.getCanvas();
        const camera = this.getCamera();
        if (!canvas || !camera) return;

        const rect = canvas.getBoundingClientRect();
        const offset = computeDragOffset(
            model.position,
            clientX - rect.left,
            clientY - rect.top,
            rect.width,
            rect.height,
            camera,
        );
        this.dragOffset = offset;
    }

    onExecute(): void {
        const canvas = this.getCanvas();
        if (!canvas) return;

        // Disable orbit controls while dragging
        this.setControlsEnabled(false);

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
        this.setControlsEnabled(true);

        this.model = null;
        this.dragOffset = null;
        this.isDragging = false;
    }

    private onPointerMove(e: PointerEvent): void {
        if (!this.model || !this.dragOffset) return;

        // Detect drag threshold (3px)
        if (!this.isDragging) {
            if (Math.abs(e.clientX - this.pointerDown.x) > 3 || Math.abs(e.clientY - this.pointerDown.y) > 3) {
                this.isDragging = true;
            } else {
                return;
            }
        }

        const canvas = this.getCanvas();
        const camera = this.getCamera();
        if (!canvas || !camera) return;

        const rect = canvas.getBoundingClientRect();
        const newPos = computeDragPositionWithOffset(
            this.dragOffset,
            this.model.position,
            e.clientX - rect.left,
            e.clientY - rect.top,
            rect.width,
            rect.height,
            camera,
        );
        if (newPos) {
            this.model.position = newPos;
        }
    }

    private onPointerUp(_e: PointerEvent): void {
        // End the move command when pointer is released
        CommandManager.getInstance().completeCurrent();
    }

    private getCanvas(): HTMLCanvasElement | null {
        return this.viewer.getScene3d()?.getSceneManager().getRenderer().domElement ?? null;
    }

    private getCamera(): THREE.PerspectiveCamera | null {
        return this.viewer.getScene3d()?.getSceneManager().getCamera() ?? null;
    }

    private setControlsEnabled(enabled: boolean): void {
        const controls = Scene3DManager.getInstance().getControls();
        if (controls) {
            controls.raw.enabled = enabled;
        }
    }
}

export { isDraggable, isHostModel };
