import * as THREE from 'three';
import { Command } from './Command';
import { CommandManager } from './CommandManager';
import { AppViewer } from '@designer/app';
import { FurnitureModel } from '@designer/core/model/FurnitureModel';
import { WallModel } from '@designer/core/model/WallModel';
import { App } from '@designer/core';
import { Scene3DManager } from '@designer/app/3d/Scene3DManager';
import { fromThreeJS } from '@designer/app/3d/util/archToThreeJS';

/**
 * Move host model command.
 * Activated when a door or window FurnitureModel is selected and dragged.
 * Host models attach to walls: the drag ray is intersected with the host
 * wall's vertical plane, and the furniture position + wall hole are updated.
 */
export class MoveHostModelCommand implements Command {
    readonly name = 'moveHostModel';

    private viewer: AppViewer;

    // Drag state
    private model: FurnitureModel | null = null;
    /** Wall used for ray intersection during drag (the wall at drag start) */
    private dragWall: WallModel | null = null;
    /** Wall that originally hosted the furniture (for removing old hole) */
    private originalWall: WallModel | null = null;
    private pointerDown = new THREE.Vector2();
    private isDragging = false;

    // Drag offset along wall direction (arch coords)
    private dragDeltaAlongWall: number = 0;
    private originalPerpOffset: number = 0;
    private originalZ: number = 0;

    private boundPointerMove: (e: PointerEvent) => void;
    private boundPointerUp: (e: PointerEvent) => void;

    constructor(viewer: AppViewer) {
        this.viewer = viewer;
        this.boundPointerMove = this.onPointerMove.bind(this);
        this.boundPointerUp = this.onPointerUp.bind(this);
    }

    /**
     * Sets the door/window model to be moved. Must be called before execute.
     *
     * @param model    The door or window FurnitureModel
     * @param clientX  Pointer X at selection time (viewport-relative)
     * @param clientY  Pointer Y at selection time (viewport-relative)
     */
    setModel(model: FurnitureModel, clientX: number, clientY: number): void {
        this.model = model;
        this.isDragging = false;
        this.pointerDown.set(clientX, clientY);
        this.originalZ = model.position.z;
        this.dragWall = this.findHostWall(model);
        this.originalWall = this.dragWall;

        if (!this.dragWall) return;

        const wall = this.dragWall;
        const dir = new THREE.Vector2().subVectors(wall.to, wall.from).normalize();
        const perp = new THREE.Vector2(-dir.y, dir.x);

        // Save perpendicular offset of furniture from wall center line
        const toFurniture = new THREE.Vector2(
            model.position.x - wall.from.x,
            model.position.y - wall.from.y,
        );
        this.originalPerpOffset = toFurniture.dot(perp);

        // Compute initial pick point on wall plane
        const archRay = this.screenToArchRay(clientX, clientY);
        if (!archRay) return;
        const pickOnWall = this.intersectWallPlane(archRay.origin, archRay.direction, wall);
        if (!pickOnWall) return;

        // Delta along wall = pick projection - furniture projection
        const pickAlong = new THREE.Vector2(pickOnWall.x - wall.from.x, pickOnWall.y - wall.from.y).dot(dir);
        const furnitureAlong = toFurniture.dot(dir);
        this.dragDeltaAlongWall = pickAlong - furnitureAlong;
    }

    onExecute(): void {
        const canvas = this.getCanvas();
        if (!canvas) return;
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
        this.setControlsEnabled(true);

        // Final hole update: detect which wall the furniture now overlaps
        if (this.model && this.isDragging) {
            this.finalizeHole();
        }

        this.model = null;
        this.dragWall = null;
        this.originalWall = null;
        this.isDragging = false;
    }

    // ── Private helpers ────────────────────────────────────────────────

    private onPointerMove(e: PointerEvent): void {
        if (!this.model || !this.dragWall) return;

        if (!this.isDragging) {
            if (Math.abs(e.clientX - this.pointerDown.x) > 3 || Math.abs(e.clientY - this.pointerDown.y) > 3) {
                this.isDragging = true;
                // Remove old hole at drag start so wall doesn't carry stale geometry
                this.removeLinkedHole(this.originalWall);
            } else {
                return;
            }
        }

        const newPos = this.computeNewPosition(e.clientX, e.clientY);
        if (newPos) {
            this.model.position = newPos;
        }
    }

    private onPointerUp(_e: PointerEvent): void {
        CommandManager.getInstance().completeCurrent();
    }

    /**
     * Computes the new furniture position by intersecting the pick ray with
     * the host wall's vertical plane, then projecting onto the wall line.
     */
    private computeNewPosition(clientX: number, clientY: number): THREE.Vector3 | null {
        const wall = this.dragWall!;
        const archRay = this.screenToArchRay(clientX, clientY);
        if (!archRay) return null;

        const pointOnWall = this.intersectWallPlane(archRay.origin, archRay.direction, wall);
        if (!pointOnWall) return null;

        const dir = new THREE.Vector2().subVectors(wall.to, wall.from).normalize();
        const perp = new THREE.Vector2(-dir.y, dir.x);
        const wallLength = wall.from.distanceTo(wall.to);

        // Position along wall, shifted by the initial drag delta
        let alongWall = new THREE.Vector2(pointOnWall.x - wall.from.x, pointOnWall.y - wall.from.y).dot(dir);
        alongWall -= this.dragDeltaAlongWall;

        // Clamp so furniture stays within wall bounds
        alongWall = Math.max(0, Math.min(wallLength, alongWall));

        // Reconstruct position: wall-parallel + original perpendicular offset + original z
        const newPos2D = new THREE.Vector2()
            .copy(wall.from)
            .addScaledVector(dir, alongWall)
            .addScaledVector(perp, this.originalPerpOffset);

        return new THREE.Vector3(newPos2D.x, newPos2D.y, this.originalZ);
    }

    // ── Ray / wall geometry ────────────────────────────────────────────

    /**
     * Builds a ray in architectural coordinates (Z-up) from screen coords.
     */
    private screenToArchRay(clientX: number, clientY: number): { origin: THREE.Vector3; direction: THREE.Vector3 } | null {
        const canvas = this.getCanvas();
        const camera = this.getCamera();
        if (!canvas || !camera) return null;

        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1,
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);

        const origin = fromThreeJS(raycaster.ray.origin.clone());
        const dirEnd = fromThreeJS(
            raycaster.ray.origin.clone().add(raycaster.ray.direction.clone()),
        );
        const direction = dirEnd.sub(origin).normalize();

        return { origin, direction };
    }

    /**
     * Intersects a ray with the wall's vertical plane and returns the 3D
     * intersection point in architectural coordinates.
     *
     * The wall plane passes through `wall.from` with normal = perpendicular
     * to wall direction in the XY plane.
     */
    private intersectWallPlane(
        rayOrigin: THREE.Vector3,
        rayDir: THREE.Vector3,
        wall: WallModel,
    ): THREE.Vector3 | null {
        const wallDir2D = new THREE.Vector2().subVectors(wall.to, wall.from);
        if (wallDir2D.lengthSq() < 1e-10) return null;
        wallDir2D.normalize();

        // Plane normal (perpendicular to wall in XY, z = 0)
        const normal = new THREE.Vector3(-wallDir2D.y, wallDir2D.x, 0);

        const denom = rayDir.dot(normal);
        if (Math.abs(denom) < 1e-10) return null; // ray parallel to wall

        const diff = new THREE.Vector3().subVectors(
            new THREE.Vector3(wall.from.x, wall.from.y, 0),
            rayOrigin,
        );
        const t = diff.dot(normal) / denom;

        return rayOrigin.clone().addScaledVector(rayDir, t);
    }

    // ── Wall / hole helpers ────────────────────────────────────────────

    /**
     * Finds the wall that hosts the given door/window furniture using
     * `checkFurnitureOverlap` — based on actual geometric overlap.
     */
    private findHostWall(furniture: FurnitureModel): WallModel | null {
        const scene = App.getInstance().getScene();
        for (const wall of scene.walls) {
            if (wall.checkFurnitureOverlap(furniture)) {
                return wall;
            }
        }
        return null;
    }

    /** Removes the wall hole linked to the current model from the given wall. */
    private removeLinkedHole(wall: WallModel | null): void {
        if (!wall || !this.model) return;
        const hole = wall.holes.find(h => h.linkModelId === this.model!.id);
        if (hole) {
            wall.removeHole(hole.id);
        }
    }

    /**
     * Finalizes hole placement after drag ends.
     * Uses `checkFurnitureOverlap` to detect which wall the furniture now
     * overlaps with, removes any stale hole from the original wall, and
     * adds the new hole to the target wall.
     */
    private finalizeHole(): void {
        if (!this.model) return;

        // Remove stale hole from original wall (if different from target)
        if (this.originalWall) {
            this.removeLinkedHole(this.originalWall);
        }

        // Find the wall the furniture now sits on and add hole
        const scene = App.getInstance().getScene();
        for (const wall of scene.walls) {
            const hole = wall.checkFurnitureOverlap(this.model);
            if (hole) {
                wall.addHole(hole);
                return;
            }
        }
    }

    // ── Canvas / camera / controls ─────────────────────────────────────

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
