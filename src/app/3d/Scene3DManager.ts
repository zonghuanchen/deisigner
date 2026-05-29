import * as THREE from 'three';
import { CameraModel, CameraManager, App, SelectionManager } from '../../core';
import { BaseModel } from '../../core/model/BaseModel';
import { CameraModelOrbitControls } from './CameraModelOrbitControls';
import { DisplayObject3D } from './display/DisplayObject3D';
import { Scene } from './display/Scene';
import { toThreeJS } from './util/archToThreeJS';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import './display/Floor';
import './display/Wall';
import './display/Room';
import './display/Face';
import './display/Furniture';
import './display/Parametric';

export class Scene3DManager {
    private static instance: Scene3DManager;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private controls!: CameraModelOrbitControls;
    private renderer: THREE.WebGLRenderer;
    private cameraModel: CameraModel | null = null;
    private gridHelper: THREE.GridHelper | null = null;
    private ground: THREE.Mesh | null = null;
    private selectionManager: SelectionManager;
    private composer!: EffectComposer;
    private outlinePass!: OutlinePass;
    private raycaster = new THREE.Raycaster();
    private pointerDown = new THREE.Vector2();
    private isDragging = false;
    private resizeObserver: ResizeObserver | null = null;
    private container: HTMLElement | null = null;

    /**
      * Gets the singleton instance of Scene3DManager
      */
    static getInstance(): Scene3DManager {
        if (!Scene3DManager.instance) {
            Scene3DManager.instance = new Scene3DManager();
        }
        return Scene3DManager.instance;
    }

    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xffffff); // White background

        // Initialize camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000,
        );

        // Initialize renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });

        // Setup camera model integration (must precede controls creation)
        this.setupCameraModel();

        // Initialize controls bound to the CameraModel
        if (this.cameraModel) {
            this.controls = new CameraModelOrbitControls(this.cameraModel, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            this.controls.minDistance = 2;
            this.controls.maxDistance = 50;
        }

        // Add light gray grid floor (below ground plane)
        this.gridHelper = new THREE.GridHelper(32, 32, 0xcccccc, 0xdddddd);
        this.gridHelper.position.y = -0.01;
        this.scene.add(this.gridHelper);

        // Add large white ground plane
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xeeeeee,
            metalness: 0.1,
            roughness: 1,
        });
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.y = -0.01;
        this.scene.add(this.ground);

        // Add blue skybox with gradient (hemisphere above ground only, matching grid size)
        const skyGeo = new THREE.SphereGeometry(16, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0xc0ddff) }, // Even lighter blue at top
                bottomColor: { value: new THREE.Color(0xe1f3fa) } // Even lighter blue at horizon
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(h, 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(sky);

        // Add ambient light for better visibility
        const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
        this.scene.add(ambientLight);

        // Add directional light to illuminate the ground
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(10, 20, 10);
        this.scene.add(directionalLight);

        // Find the Scene display object and add its node to the Three.js scene
        for (const display of DisplayObject3D.getAll()) {
            if (display instanceof Scene) {
                this.scene.add(display.node);
            }
        }

        // Setup selection highlighting
        this.selectionManager = App.getInstance().getSelectionManager();
        this.selectionManager.addEventListener('select', (e: any) => this.highlightModel(e.model));
        this.selectionManager.addEventListener('deselect', (e: any) => this.unhighlightModel(e.model));
        this.selectionManager.addEventListener('clear', (e: any) => this.unhighlightAll(e.previous));
    }

    private setupPostProcessing() {
        const pixelRatio = this.renderer.getPixelRatio();
        const size = this.renderer.getSize(new THREE.Vector2());
        const width = Math.floor(size.width * pixelRatio);
        const height = Math.floor(size.height * pixelRatio);

        this.composer = new EffectComposer(this.renderer);
        this.composer.setSize(width, height);

        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        this.outlinePass = new OutlinePass(new THREE.Vector2(width, height), this.scene, this.camera);
        this.outlinePass.edgeStrength = 3;
        this.outlinePass.edgeGlow = 0;
        this.outlinePass.edgeThickness = 1;
        this.outlinePass.visibleEdgeColor.set(0x44aaff);
        this.outlinePass.hiddenEdgeColor.set(0x44aaff);
        this.composer.addPass(this.outlinePass);
    }

    private setupCameraModel() {
        // Get CameraManager instance from App to retrieve the active camera model
        const cameraManager = App.getInstance().getCameraManager();
        if (cameraManager) {
            const activeCamera = cameraManager.getActiveCamera();
            if (activeCamera) {
                this.cameraModel = activeCamera;

                // Apply full camera state from model
                this.syncCameraFromModel();

                // Listen to camera model changes
                this.cameraModel.addEventListener('change', () => this.onCameraModelChange());
            }
        }
    }

    private onCameraModelChange() {
        this.syncCameraFromModel();
        this.updateGridVisibility();
    }

    /**
     * Hides grid and ground when camera is below ground level (z < 0 in architectural coordinates)
     */
    private updateGridVisibility() {
        if (!this.cameraModel) return;
        
        // CameraModel uses architectural coordinates (Z-up), so check z instead of y
        const cameraZ = this.cameraModel.position.z;
        const shouldShow = cameraZ >= 0;
        
        if (this.gridHelper) {
            this.gridHelper.visible = shouldShow;
        }
        if (this.ground) {
            this.ground.visible = shouldShow;
        }
    }

    private syncCameraFromModel() {
        if (!this.cameraModel) return;
        const m = this.cameraModel;
        // Convert from architectural coordinates (Z-up) to Three.js coordinates (Y-up)
        this.camera.position.copy(toThreeJS(m.position));
        this.camera.up.copy(toThreeJS(m.up));
        const target = toThreeJS(m.target);
        this.camera.lookAt(target);
        this.camera.fov = m.fov;
        // Always derive aspect from the renderer container, not the model,
        // to avoid distortion when the model fires change events.
        if (this.container) {
            this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        } else {
            this.camera.aspect = m.aspect;
        }
        this.camera.near = m.near;
        this.camera.far = m.far;
        this.camera.zoom = m.zoom;
        this.camera.updateProjectionMatrix();
    }

    getScene(): THREE.Scene {
        return this.scene;
    }

    getCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }

    getRenderer(): THREE.WebGLRenderer {
        return this.renderer;
    }

    getControls(): CameraModelOrbitControls {
        return this.controls;
    }

    setRendererContainer(container: HTMLElement) {
        this.container = container;
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(this.renderer.domElement);

        // Update camera aspect ratio to match container dimensions
        if (this.cameraModel) {
            this.cameraModel.aspect = container.clientWidth / container.clientHeight;
        }

        // Setup post-processing after renderer has correct size and pixel ratio
        this.setupPostProcessing();
        this.setupPicking();

        // Observe container resizes to keep aspect ratio and renderer in sync
        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    this.resize(width, height);
                }
            }
        });
        this.resizeObserver.observe(container);
    }

    private setupPicking() {
        const domElement = this.renderer.domElement;
        domElement.addEventListener('pointerdown', (e: PointerEvent) => {
            this.pointerDown.set(e.clientX, e.clientY);
            this.isDragging = false;
        });
        domElement.addEventListener('pointermove', (e: PointerEvent) => {
            if (Math.abs(e.clientX - this.pointerDown.x) > 3 || Math.abs(e.clientY - this.pointerDown.y) > 3) {
                this.isDragging = true;
            }
        });
        domElement.addEventListener('pointerup', (e: PointerEvent) => {
            if (this.isDragging) return;
            this.onPointerClick(e);
        });
    }

    private onPointerClick(event: PointerEvent) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(mouse, this.camera);

        // Collect all pickable objects (exclude grid, ground, skybox)
        const pickables: THREE.Object3D[] = [];
        for (const display of DisplayObject3D.getAll()) {
            if (!(display instanceof Scene) && display.node.visible) {
                pickables.push(display.node);
            }
        }

        const intersects = this.raycaster.intersectObjects(pickables, true)
            .filter(hit => this.isVisible(hit.object));
        if (intersects.length > 0) {
            const display = this.findDisplayObject(intersects[0].object);
            if (display) {
                this.selectionManager.select(display.modelRef);
                return;
            }
        }
        // Clicked empty space — clear selection
        this.selectionManager.clear();
    }

    /** Walks up the scene graph to find the DisplayObject3D that owns the given object */
    private findDisplayObject(object: THREE.Object3D): DisplayObject3D | undefined {
        let current: THREE.Object3D | null = object;
        while (current) {
            for (const display of DisplayObject3D.getAll()) {
                if (display.node === current) return display;
            }
            current = current.parent;
        }
        return undefined;
    }

    /** Returns false if the object or any ancestor is invisible */
    private isVisible(object: THREE.Object3D): boolean {
        let current: THREE.Object3D | null = object;
        while (current) {
            if (!current.visible) return false;
            current = current.parent;
        }
        return true;
    }

    updateControls() {
        this.controls?.update();
    }

    render() {
        this.controls?.update();
        this.composer.render();
    }

    resize(width: number, height: number) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        const pixelRatio = this.renderer.getPixelRatio();
        this.composer.setSize(Math.floor(width * pixelRatio), Math.floor(height * pixelRatio));

        // Keep CameraModel in sync
        if (this.cameraModel && this.cameraModel.aspect !== this.camera.aspect) {
            this.cameraModel.aspect = this.camera.aspect;
        }
    }

    add(object: THREE.Object3D): void {
        this.scene.add(object);
    }

    remove(object: THREE.Object3D): void {
        this.scene.remove(object);
    }

    // ── Selection Outline ────────────────────────────────────────────────────

    private highlightModel(model: BaseModel): void {
        const display = DisplayObject3D.get(model.id);
        if (!display) return;
        const meshes: THREE.Mesh[] = [];
        display.node.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                meshes.push(child as THREE.Mesh);
            }
        });
        this.outlinePass.selectedObjects.push(...meshes);
    }

    private unhighlightModel(model: BaseModel): void {
        const display = DisplayObject3D.get(model.id);
        if (!display) return;
        const toRemove = new Set<string>();
        display.node.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                toRemove.add(child.uuid);
            }
        });
        this.outlinePass.selectedObjects = this.outlinePass.selectedObjects.filter(
            obj => !toRemove.has(obj.uuid),
        );
    }

    private unhighlightAll(_models: BaseModel[]): void {
        this.outlinePass.selectedObjects = [];
    }
}
