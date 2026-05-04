import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CameraModel } from '../../core/model/CameraModel';
import { ModelRegistry } from '../../core/ModelRegistry';
import { CAMERA_MODEL, CAMERA_MANAGER } from '../../core/types';
import { CameraManager } from '../../core/model/CameraManager';

export class Scene3DManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private renderer: THREE.WebGLRenderer;
  private cameraModel: CameraModel | null = null;

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
    
    // Initialize controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 50;

    // Add light gray grid floor
    const gridHelper = new THREE.GridHelper(32, 32, 0xcccccc, 0xdddddd);
    this.scene.add(gridHelper);

    // Add large white ground plane
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
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
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    this.scene.add(ambientLight);

    // Add directional light to illuminate the ground
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(10, 20, 10);
    this.scene.add(directionalLight);

    // Setup camera model integration
    this.setupCameraModel();
  }

  private setupCameraModel() {
    // Get CameraManager to retrieve the active camera model
    const cameraManager = ModelRegistry.getInstance().get<CameraManager>(CAMERA_MANAGER);
    if (cameraManager) {
      const activeCamera = cameraManager.getActiveCamera();
      if (activeCamera) {
        this.cameraModel = activeCamera;
        
        // Set initial camera position from model
        this.camera.position.copy(this.cameraModel.position);
        this.camera.lookAt(this.cameraModel.target);

        // Listen to camera model changes
        this.cameraModel.addEventListener('change', () => this.onCameraModelChange());
      }
    }
  }

  private onCameraModelChange() {
    if (this.cameraModel) {
      // Update THREE.js camera based on model changes
      this.camera.position.copy(this.cameraModel.position);
      this.camera.lookAt(this.cameraModel.target);
    }
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

  getControls(): OrbitControls {
    return this.controls;
  }

  setRendererContainer(container: HTMLElement) {
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);
  }

  updateControls() {
    this.controls.update();
  }

  render() {
    this.controls.update();
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
