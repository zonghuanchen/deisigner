import * as THREE from 'three';
import { CameraModel, CameraManager, App } from '../../core';
import { CameraModelOrbitControls } from './CameraModelOrbitControls';
import { DisplayObject3D } from './display/DisplayObject3D';
import { Scene } from './display/Scene';
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
        const gridHelper = new THREE.GridHelper(32, 32, 0xcccccc, 0xdddddd);
        gridHelper.position.y = -0.01;
        this.scene.add(gridHelper);

        // Add large white ground plane
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xeeeeee,
            metalness: 0.1,
            roughness: 1,
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.01;
        this.scene.add(ground);

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
        const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
        this.scene.add(ambientLight);

        // Add directional light to illuminate the ground
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(10, 20, 10);
        this.scene.add(directionalLight);

        // Find the Scene display object and add its node to the Three.js scene
        for (const display of DisplayObject3D.getAll()) {
            if (display instanceof Scene) {
                this.scene.add(display.node);
            }
        }
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
    }

    private syncCameraFromModel() {
        if (!this.cameraModel) return;
        const m = this.cameraModel;
        this.camera.position.copy(m.position);
        this.camera.up.copy(m.up);
        this.camera.lookAt(m.target);
        this.camera.fov = m.fov;
        this.camera.aspect = m.aspect;
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
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(this.renderer.domElement);
    }

    updateControls() {
        this.controls?.update();
    }

    render() {
        this.controls?.update();
        this.renderer.render(this.scene, this.camera);
    }

    resize(width: number, height: number) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    add(object: THREE.Object3D): void {
        this.scene.add(object);
    }

    remove(object: THREE.Object3D): void {
        this.scene.remove(object);
    }
}
