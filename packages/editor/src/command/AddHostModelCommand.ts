import * as THREE from 'three';
import { Command } from './Command';
import { CommandManager } from './CommandManager';
import { AppViewer } from '@designer/app';
import { FurnitureModel } from '@designer/core/model/FurnitureModel';
import { WallModel } from '@designer/core/model/WallModel';
import { App } from '@designer/core';
import { Scene3DManager } from '@designer/app/3d/Scene3DManager';
import { DisplayObject3D } from '@designer/app/3d/display/DisplayObject3D';
import { fromThreeJS } from '@designer/app/3d/util/archToThreeJS';

/**
 * Add host model command (door / window).
 * On execute, listens for pointer movement to pick a wall surface and
 * snap the furniture model onto it. Click to confirm placement; on
 * completion a wall hole is automatically created via
 * `WallModel.checkFurnitureOverlap`.
 * Press Escape to cancel.
 */
export class AddHostModelCommand implements Command {
    readonly name = 'addHostModel';

    private viewer: AppViewer;
    private model: FurnitureModel | null = null;
    /** The wall currently hovered by the cursor */
    private hoverWall: WallModel | null = null;

    private boundMouseMove: (e: MouseEvent) => void;
    private boundClick: (e: MouseEvent) => void;
    private boundKeyDown: (e: KeyboardEvent) => void;

    /** Blue wireframe box shown during placement (depth-test disabled) */
    private placementBox: THREE.BoxHelper | null = null;
    /** Whether we have already applied render-on-top settings to the GLTF meshes */
    private renderOnTopApplied = false;

    constructor(viewer: AppViewer) {
        this.viewer = viewer;
        this.boundMouseMove = this.onMouseMove.bind(this);
        this.boundClick = this.onClick.bind(this);
        this.boundKeyDown = this.onKeyDown.bind(this);
    }

    /**
     * Sets the door/window model to be placed. Must be called before execute.
     */
    setModel(model: FurnitureModel): void {
        this.model = model;
    }

    onExecute(): void {
        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('click', this.boundClick, true);   // capture phase
        document.addEventListener('keydown', this.boundKeyDown);
        document.body.style.cursor = 'crosshair';
        this.setControlsEnabled(false);
        this.renderOnTopApplied = false;

        // Create a blue wireframe bounding box that renders on top (no depth test).
        // We use BoxHelper on the display group; it will update as the group moves.
        if (this.model) {
            const display = DisplayObject3D.get(this.model.id);
            if (display) {
                const box = new THREE.BoxHelper(display.node, 0x0066ff);
                // Make all materials in the BoxHelper ignore depth so it draws on top of walls
                box.traverse((child) => {
                    const mat = (child as THREE.LineSegments).material;
                    if (mat) {
                        (mat as THREE.Material).depthTest = false;
                        (mat as THREE.Material).depthWrite = false;
                    }
                });
                box.renderOrder = 999;
                this.placementBox = box;
                Scene3DManager.getInstance().getScene().add(box);
            }
        }
    }

    onComplete(): void {
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('click', this.boundClick, true);
        document.removeEventListener('keydown', this.boundKeyDown);
        document.body.style.cursor = '';
        this.setControlsEnabled(true);

        // Remove the placement wireframe box
        if (this.placementBox) {
            Scene3DManager.getInstance().getScene().remove(this.placementBox);
            this.placementBox.dispose();
            this.placementBox = null;
        }

        // Restore normal render settings on the furniture display
        if (this.model) {
            this.restoreRenderSettings(this.model);
            this.createHole(this.model);
        }

        this.model = null;
        this.hoverWall = null;
        this.renderOnTopApplied = false;
    }

    // ── Event handlers ─────────────────────────────────────────────────

    private onMouseMove(e: MouseEvent): void {
        if (!this.model) return;

        const archRay = this.screenToArchRay(e.clientX, e.clientY);
        if (!archRay) return;

        // Find the closest wall the ray intersects
        const scene = App.getInstance().getScene();
        let bestWall: WallModel | null = null;
        let bestDist = Infinity;
        let bestPoint: THREE.Vector3 | null = null;

        for (const wall of scene.walls) {
            const hit = this.intersectWallPlane(archRay.origin, archRay.direction, wall);
            if (!hit) continue;

            // Check the hit is within the wall's extent (along + height)
            const wallDir = new THREE.Vector2().subVectors(wall.to, wall.from);
            const wallLen = wallDir.length();
            if (wallLen < 1e-6) continue;
            wallDir.normalize();

            const along = new THREE.Vector2(hit.x - wall.from.x, hit.y - wall.from.y).dot(wallDir);
            if (along < 0 || along > wallLen) continue;
            if (hit.z < 0 || hit.z > wall.height) continue;

            const dist = hit.distanceTo(archRay.origin);
            if (dist < bestDist) {
                bestDist = dist;
                bestWall = wall;
                bestPoint = hit;
            }
        }

        if (!bestWall || !bestPoint) return;

        this.hoverWall = bestWall;

        // Snap model position onto the wall center-line
        const wallDir = new THREE.Vector2().subVectors(bestWall.to, bestWall.from).normalize();
        const wallLength = bestWall.from.distanceTo(bestWall.to);

        let alongWall = new THREE.Vector2(
            bestPoint.x - bestWall.from.x,
            bestPoint.y - bestWall.from.y,
        ).dot(wallDir);

        // Clamp within wall bounds
        alongWall = Math.max(0, Math.min(wallLength, alongWall));

        const snapped2D = new THREE.Vector2()
            .copy(bestWall.from)
            .addScaledVector(wallDir, alongWall);

        // Z: keep the model's current z (e.g. sill height for window, 0 for door)
        this.model.position = new THREE.Vector3(snapped2D.x, snapped2D.y, this.model.position.z);

        // Rotate model to align with wall direction
        const angle = Math.atan2(wallDir.y, wallDir.x);
        this.model.rotation = new THREE.Euler(0, 0, angle);

        // Update the wireframe box position
        if (this.placementBox) {
            this.placementBox.update();
        }

        // Once the GLTF meshes have loaded, apply render-on-top settings
        // so the furniture is visible even when embedded in a wall.
        if (!this.renderOnTopApplied) {
            this.tryApplyRenderOnTop();
        }
    }

    private onClick(_e: MouseEvent): void {
        // Confirm placement
        CommandManager.getInstance().completeCurrent();
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            CommandManager.getInstance().completeCurrent();
        }
    }

    // ── Ray / wall geometry ────────────────────────────────────────────

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
     * Intersects a ray with the wall's vertical plane.
     * Returns the 3D intersection point in architectural coordinates.
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

    // ── Hole creation ──────────────────────────────────────────────────

    private createHole(furniture: FurnitureModel): void {
        const scene = App.getInstance().getScene();
        for (const wall of scene.walls) {
            const hole = wall.checkFurnitureOverlap(furniture);
            if (hole) {
                wall.addHole(hole);
                return;
            }
        }
    }

    // ── Render-on-top helpers ───────────────────────────────────────────

    /**
     * Tries to set render-on-top on the furniture display meshes.
     * Called each mouse-move until it succeeds (GLTF may still be loading).
     */
    private tryApplyRenderOnTop(): void {
        if (!this.model) return;
        const display = DisplayObject3D.get(this.model.id);
        if (!display) return;

        const meshes: THREE.Mesh[] = [];
        display.node.traverse((child: THREE.Object3D) => {
            if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
        });
        if (meshes.length === 0) return; // GLTF not loaded yet

        for (const mesh of meshes) {
            mesh.renderOrder = 998;
            const mat = mesh.material as THREE.Material;
            if (mat) {
                mat.depthTest = false;
                mat.depthWrite = false;
                mat.transparent = true;
            }
        }
        this.renderOnTopApplied = true;
    }

    /**
     * Restores normal depth-test and render-order after placement.
     */
    private restoreRenderSettings(model: FurnitureModel): void {
        const display = DisplayObject3D.get(model.id);
        if (!display) return;
        display.node.traverse((child: THREE.Object3D) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                mesh.renderOrder = 0;
                const mat = mesh.material as THREE.Material;
                if (mat) {
                    mat.depthTest = true;
                    mat.depthWrite = true;
                    mat.transparent = false;
                }
            }
        });
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
