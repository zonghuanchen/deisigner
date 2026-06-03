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
import { Device } from './device';
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
    private gridPlane: THREE.Mesh | null = null;
    private ground: THREE.Mesh | null = null;
    private selectionManager: SelectionManager;
    private composer!: EffectComposer;
    private outlinePass!: OutlinePass;
    private device: Device | null = null;
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

        // Add light gray grid floor using a custom shader plane (supports thick lines)
        const gridSize = 256;
        const gridDivisions = 32;
        const gridGeo = new THREE.PlaneGeometry(gridSize, gridSize);
        const gridMat = new THREE.ShaderMaterial({
            uniforms: {
                uSize: { value: gridSize },
                uDivisions: { value: gridDivisions },
                uLineWidth: { value: 1.0 },      // thickness in pixels
                uColorMajor: { value: new THREE.Color(0xbbbbbb) },
                uColorMinor: { value: new THREE.Color(0xdddddd) },
                uBgColor: { value: new THREE.Color(0xeeeeee) },
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uSize;
                uniform float uDivisions;
                uniform float uLineWidth;
                uniform vec3 uColorMajor;
                uniform vec3 uColorMinor;
                uniform vec3 uBgColor;
                varying vec2 vUv;

                float gridLine(float coord, float divisions, float lineWidth) {
                    float grid = abs(fract(coord * divisions - 0.5) - 0.5) / fwidth(coord * divisions);
                    return 1.0 - min(grid / lineWidth, 1.0);
                }

                void main() {
                    float cellSize = uSize / uDivisions;
                    // Minor grid (every division)
                    float minor = gridLine(vUv.x, uDivisions, uLineWidth)
                                + gridLine(vUv.y, uDivisions, uLineWidth);
                    // Major grid (every 5 divisions)
                    float majorDiv = uDivisions / 5.0;
                    float major = gridLine(vUv.x, majorDiv, uLineWidth * 1.5)
                                + gridLine(vUv.y, majorDiv, uLineWidth * 1.5);
                    minor = clamp(minor, 0.0, 1.0);
                    major = clamp(major, 0.0, 1.0);
                    vec3 color = mix(uBgColor, uColorMinor, minor);
                    color = mix(color, uColorMajor, major);
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
        });
        const gridPlane = new THREE.Mesh(gridGeo, gridMat);
        gridPlane.rotation.x = -Math.PI / 2;
        gridPlane.position.y = -0.005;
        this.gridPlane = gridPlane;
        this.scene.add(gridPlane);        

        // Add blue skybox with gradient (hemisphere above ground only, matching grid size)
        const skyGeo = new THREE.SphereGeometry(128, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0xc0ddff) }, // Even lighter blue at top
                bottomColor: { value: new THREE.Color(0xffffff) } // Even lighter blue at horizon
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
        const ambientLight = new THREE.AmbientLight(0xffffff, 4.0);
        this.scene.add(ambientLight);

        // Add directional light to illuminate the ground
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
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
        
        if (this.gridPlane) {
            this.gridPlane.visible = shouldShow;
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
        this.device = new Device(this.camera, this.renderer.domElement, this.selectionManager);

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
