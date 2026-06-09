import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { MoveModelCommand } from './command/MoveModelCommand';
import { jscadToBufferGeometry } from '@designer/pm-engine';
import type { BuildStep } from '@designer/pm-engine';

/**
 * Lightweight Three.js scene manager for pm-editor.
 * Provides a renderer, perspective camera, orbit controls, grid, and lighting.
 * Supports per-group picking and selection highlight.
 */
export class Scene3D {
    private scene: THREE.Scene;
    private rootGroup: THREE.Group;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: OrbitControls;
    private composer: EffectComposer;
    private outlinePass: OutlinePass;
    private container: HTMLElement;
    private resizeObserver: ResizeObserver;
    private animationId: number | null = null;

    /** Maps each added Group to its ParametricDef index */
    private groupMap = new Map<THREE.Group, number>();
    /** Currently highlighted (selected) group */
    private selectedGroup: THREE.Group | null = null;
    /** Build-process ghost meshes (cleared on deselect) */
    private buildProcessGroup: THREE.Group | null = null;
    /** Source group that the build process wrapper should follow */
    private buildProcessSource: THREE.Group | null = null;
    /** Raycaster for picking */
    private raycaster = new THREE.Raycaster();
    /** Active move command (drag-to-move selected group) */
    private moveCommand: MoveModelCommand | null = null;
    /** Callback fired when selection changes; index is null when deselected */
    onSelect: ((index: number | null) => void) | null = null;
    /** Callback fired when a group is moved (during drag); provides defIndex and new Three.js position */
    onMove: ((index: number, position: THREE.Vector3) => void) | null = null;

    constructor(container: HTMLElement) {
        this.container = container;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x404060);

        // Root group: Z-up (local) → Y-up (world) via −90° X rotation.
        // All def groups are added here so geometry & transforms stay in Z-up natively.
        this.rootGroup = new THREE.Group();
        this.rootGroup.rotation.x = -Math.PI / 2;
        this.scene.add(this.rootGroup);

        // Camera (Y-up, Three.js convention)
        const aspect = container.clientWidth / container.clientHeight || 1;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
        this.camera.position.set(5, 5, 5);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(this.renderer.domElement);

        // OrbitControls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 1;
        this.controls.maxDistance = 100;

        // Lighting (hemisphere + ambient + directional, no shadows)
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8888aa, 0.8);
        this.scene.add(hemiLight);

        const ambient = new THREE.AmbientLight(0xffffff, 1.5);
        this.scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(5, 10, 7);
        this.scene.add(dirLight);

        const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight2.position.set(-5, 3, -5);
        this.scene.add(dirLight2);

        // Fill light from front to reduce dark faces
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
        fillLight.position.set(0, 2, 10);
        this.scene.add(fillLight);

        // Grid floor (XZ plane in Three.js = ground plane)
        const grid = new THREE.GridHelper(20, 20, 0x666688, 0x555577);
        this.scene.add(grid);

        // Axes helper
        const axes = new THREE.AxesHelper(2);
        this.scene.add(axes);

        // Post-processing: EffectComposer + RenderPass + OutlinePass
        const pixelRatio = this.renderer.getPixelRatio();
        const w = container.clientWidth * pixelRatio;
        const h = container.clientHeight * pixelRatio;
        this.composer = new EffectComposer(
            this.renderer,
            new THREE.WebGLRenderTarget(w, h),
        );
        this.composer.setPixelRatio(pixelRatio);
        this.composer.setSize(container.clientWidth, container.clientHeight);

        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        this.outlinePass = new OutlinePass(
            new THREE.Vector2(container.clientWidth, container.clientHeight),
            this.scene,
            this.camera,
        );
        this.outlinePass.edgeStrength = 5;
        this.outlinePass.edgeGlow = 0.5;
        this.outlinePass.edgeThickness = 1.5;
        this.outlinePass.visibleEdgeColor.set(0x4488ff);
        this.outlinePass.hiddenEdgeColor.set(0x4488ff);
        this.composer.addPass(this.outlinePass);

        // Click-to-pick
        this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
        // Complete move command when pointer leaves the canvas
        this.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave);

        // Resize observer
        this.resizeObserver = new ResizeObserver(() => this.onResize());
        this.resizeObserver.observe(container);

        // Start render loop
        this.startRenderLoop();
    }

    getScene(): THREE.Scene {
        return this.scene;
    }

    getRootGroup(): THREE.Group {
        return this.rootGroup;
    }

    getCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }

    getRenderer(): THREE.WebGLRenderer {
        return this.renderer;
    }

    getControls(): OrbitControls {
        return this.controls;
    }

    /**
     * Add a Group representing a single ParametricDef.
     * Registers it for picking so clicks can identify it by defIndex.
     */
    addDefGroup(group: THREE.Group, defIndex: number): void {
        this.rootGroup.add(group);
        this.groupMap.set(group, defIndex);
    }

    /**
     * Remove a previously added def group and clean up resources
     */
    removeDefGroup(group: THREE.Group): void {
        if (this.selectedGroup === group) {
            this.clearSelection();
        }
        this.groupMap.delete(group);
        this.scene.remove(group);
        group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }

    /**
     * Add a generic object to the scene (non-pickable)
     */
    add(object: THREE.Object3D): void {
        this.scene.add(object);
    }

    /**
     * Remove a generic object from the scene
     */
    remove(object: THREE.Object3D): void {
        this.scene.remove(object);
    }

    /**
     * Programmatically select a def group by index (or null to deselect)
     */
    selectByIndex(index: number | null): void {
        if (index === null) {
            this.clearSelection();
            return;
        }
        for (const [group, idx] of this.groupMap) {
            if (idx === index) {
                this.highlightGroup(group);
                return;
            }
        }
    }

    /**
     * Clear all user-added objects (keeps grid, axes, lights)
     */
    clearModels(): void {
        this.clearSelection();
        const toRemove: THREE.Object3D[] = [];
        this.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                toRemove.push(child);
            }
        });
        toRemove.forEach((obj) => {
            this.scene.remove(obj);
            if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                if (Array.isArray(obj.material)) {
                    obj.material.forEach((m) => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });
        this.groupMap.clear();
    }

    // ─── Build-process visualization ─────────────────────────────────────────

    /**
     * Show the build process of a ParametricDef as semi-transparent ghost meshes.
     * Each step is offset along X so they appear side-by-side.
     * @param steps Build steps from ParametricModeler.buildSteps()
     * @param sourceGroup The selected entity's group (used for position reference)
     */
    showBuildProcess(steps: BuildStep[], sourceGroup: THREE.Group): void {
        this.clearBuildProcess();

        if (steps.length <= 1) return; // No booleans → nothing interesting to show

        const wrapper = new THREE.Group();
        // Copy position from source group so ghosts appear near the entity
        wrapper.position.copy(sourceGroup.position);
        wrapper.rotation.copy(sourceGroup.rotation);
        wrapper.scale.copy(sourceGroup.scale);

        // Compute bounding box of the source to determine offset distance
        const box = new THREE.Box3().setFromObject(sourceGroup);
        const size = box.getSize(new THREE.Vector3());
        const offsetX = (size.x + 1.0); // gap between ghost steps

        const stepColors = [
            0x6c8ebf, // base: blue
            0xe8a838, // step 1: orange
            0x8b5cf6, // step 2: purple
            0x22c55e, // step 3: green
            0xef4444, // step 4: red
        ];

        for (const step of steps) {
            const bufGeo = jscadToBufferGeometry(step.geometry);
            if (!bufGeo) continue;

            const color = stepColors[step.index % stepColors.length];

            // Step result mesh (semi-transparent)
            const mat = new THREE.MeshStandardMaterial({
                color,
                transparent: true,
                opacity: 0.35,
                side: THREE.DoubleSide,
                depthWrite: false,
                wireframe: false,
            });
            const mesh = new THREE.Mesh(bufGeo, mat);

            // Wireframe overlay for clarity
            const wireMat = new THREE.MeshBasicMaterial({
                color,
                wireframe: true,
                transparent: true,
                opacity: 0.6,
            });
            const wireMesh = new THREE.Mesh(bufGeo, wireMat);

            const stepGroup = new THREE.Group();
            stepGroup.add(mesh);
            stepGroup.add(wireMesh);

            // Offset each step along X (in world space, before source transform)
            // Step 0 stays in place, subsequent steps offset to the right
            if (step.index > 0) {
                stepGroup.position.x = step.index * offsetX;
            }

            // Label sprite
            const label = this.createLabelSprite(step.label, color);
            // Place label above the mesh
            const stepBox = new THREE.Box3().setFromObject(stepGroup);
            const stepSize = stepBox.getSize(new THREE.Vector3());
            label.position.set(stepGroup.position.x, 0, stepSize.z * 0.5 + 0.8);
            stepGroup.add(label);

            // For boolean steps, show the operand shape in red-ish
            if (step.operand) {
                const opGeo = jscadToBufferGeometry(step.operand);
                if (opGeo) {
                    const opMat = new THREE.MeshStandardMaterial({
                        color: 0xff4444,
                        transparent: true,
                        opacity: 0.25,
                        side: THREE.DoubleSide,
                        depthWrite: false,
                    });
                    const opMesh = new THREE.Mesh(opGeo, opMat);
                    const opWire = new THREE.Mesh(opGeo, new THREE.MeshBasicMaterial({
                        color: 0xff6666,
                        wireframe: true,
                        transparent: true,
                        opacity: 0.5,
                    }));
                    // Place operand slightly above the result
                    opMesh.position.z = 0.15;
                    opWire.position.z = 0.15;
                    stepGroup.add(opMesh);
                    stepGroup.add(opWire);
                }
            }

            wrapper.add(stepGroup);

            // Add arrow between steps
            if (step.index > 0) {
                const arrowX = stepGroup.position.x - offsetX * 0.5;
                const arrowGeo = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(arrowX - 0.3, 0, 0),
                    new THREE.Vector3(arrowX + 0.3, 0, 0),
                ]);
                const arrowMat = new THREE.LineBasicMaterial({ color: 0x888888 });
                const arrow = new THREE.Line(arrowGeo, arrowMat);
                wrapper.add(arrow);
            }
        }

        this.buildProcessGroup = wrapper;
        this.buildProcessSource = sourceGroup;
        this.rootGroup.add(wrapper);
    }

    /**
     * Remove build-process ghost meshes from the scene
     */
    clearBuildProcess(): void {
        if (!this.buildProcessGroup) return;
        this.buildProcessGroup.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
            if (child instanceof THREE.Line) {
                child.geometry.dispose();
                if (child.material instanceof THREE.Material) child.material.dispose();
            }
            if (child instanceof THREE.Sprite) {
                child.material.map?.dispose();
                child.material.dispose();
            }
        });
        this.scene.remove(this.buildProcessGroup);
        this.buildProcessGroup = null;
        this.buildProcessSource = null;
    }

    /**
     * Create a text label sprite
     */
    private createLabelSprite(text: string, color: number): THREE.Sprite {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.width = 512;
        canvas.height = 64;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Background pill
        const textWidth = ctx.measureText(text).width;
        const px = canvas.width / 2;
        const py = canvas.height / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.roundRect(px - textWidth / 2 - 12, py - 18, textWidth + 24, 36, 8);
        ctx.fill();

        // Text
        const r = (color >> 16) & 0xff;
        const g = (color >> 8) & 0xff;
        const b = color & 0xff;
        ctx.fillStyle = `rgb(${Math.min(r + 80, 255)},${Math.min(g + 80, 255)},${Math.min(b + 80, 255)})`;
        ctx.fillText(text, px, py);

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(3.0, 0.4, 1);
        return sprite;
    }

    // ─── Selection highlight ──────────────────────────────────────────────────

    private highlightGroup(group: THREE.Group): void {
        this.clearHighlight();
        this.selectedGroup = group;

        // Collect all meshes in the group for OutlinePass
        const meshes: THREE.Object3D[] = [];
        group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                meshes.push(child);
            }
        });
        this.outlinePass.selectedObjects = meshes;
    }

    private clearHighlight(): void {
        if (!this.selectedGroup) return;
        this.outlinePass.selectedObjects = [];
        this.selectedGroup = null;
    }

    private clearSelection(): void {
        this.completeMoveCommand();
        this.clearHighlight();
        this.clearBuildProcess();
    }

    // ─── Picking ──────────────────────────────────────────────────────────────

    private onPointerDown = (event: PointerEvent): void => {
        // Ignore right-click / middle-click (orbit/pan)
        if (event.button !== 0) return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );

        this.raycaster.setFromCamera(mouse, this.camera);

        // Collect all meshes that belong to registered groups
        const meshes: THREE.Mesh[] = [];
        const meshToGroup = new Map<THREE.Mesh, THREE.Group>();
        for (const [group] of this.groupMap) {
            group.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    meshes.push(child);
                    meshToGroup.set(child, group);
                }
            });
        }

        const hits = this.raycaster.intersectObjects(meshes, false);
        if (hits.length > 0) {
            const hitMesh = hits[0].object as THREE.Mesh;
            const hitGroup = meshToGroup.get(hitMesh);
            if (hitGroup) {
                const defIndex = this.groupMap.get(hitGroup) ?? null;
                this.highlightGroup(hitGroup);
                this.onSelect?.(defIndex);

                // Start move command for the selected group
                this.startMoveCommand(hitGroup, event.clientX, event.clientY);
                return;
            }
        }

        // Clicked empty space → deselect
        this.clearHighlight();
        this.onSelect?.(null);
    };

    /**
     * Focus camera on a bounding box
     */
    focusOn(object: THREE.Object3D): void {
        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) return;

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        const distance = maxDim / (2 * Math.tan(fov / 2)) * 1.5;

        this.controls.target.copy(center);
        this.camera.position.set(
            center.x + distance * 0.6,
            center.y + distance * 0.5,
            center.z + distance * 0.6,
        );
        this.controls.update();
    }

    private onPointerLeave = (): void => {
        // If a move command is active, complete it when pointer leaves canvas
        if (this.moveCommand) {
            this.moveCommand.onComplete();
            this.moveCommand = null;
        }
    };

    /**
     * Start (or restart) the move command for a selected group
     */
    private startMoveCommand(group: THREE.Group, clientX: number, clientY: number): void {
        // Complete any existing move command
        if (this.moveCommand) {
            this.moveCommand.onComplete();
        }
        const cmd = new MoveModelCommand(this);
        cmd.setTarget(group, clientX, clientY);
        cmd.onPositionChange = (movedGroup: THREE.Group) => {
            const defIndex = this.groupMap.get(movedGroup);
            if (defIndex !== undefined) {
                this.onMove?.(defIndex, movedGroup.position);
            }
        };
        cmd.onExecute();
        this.moveCommand = cmd;
    }

    /**
     * Complete the active move command if any
     */
    private completeMoveCommand(): void {
        if (this.moveCommand) {
            this.moveCommand.onComplete();
            this.moveCommand = null;
        }
    }

    private onResize(): void {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width === 0 || height === 0) return;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);
    }

    private startRenderLoop(): void {
        const animate = () => {
            this.animationId = requestAnimationFrame(animate);
            this.controls.update();
            // Sync build-process wrapper with source group transform
            if (this.buildProcessGroup && this.buildProcessSource) {
                this.buildProcessGroup.position.copy(this.buildProcessSource.position);
                this.buildProcessGroup.rotation.copy(this.buildProcessSource.rotation);
                this.buildProcessGroup.scale.copy(this.buildProcessSource.scale);
            }
            this.composer.render();
        };
        animate();
    }

    dispose(): void {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
        }
        this.clearBuildProcess();
        this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
        this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave);
        this.resizeObserver.disconnect();
        this.controls.dispose();
        this.composer.dispose();
        this.renderer.dispose();
        if (this.renderer.domElement.parentElement) {
            this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
        }
    }
}
