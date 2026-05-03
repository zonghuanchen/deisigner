import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RenderTimer } from '../timer';

export class Scene3D {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private renderTimer: RenderTimer | null = null;

  constructor(container: HTMLElement, renderTimer?: RenderTimer) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff); // White background
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    // Add light gray grid floor
    const gridHelper = new THREE.GridHelper(32, 32, 0xcccccc, 0xdddddd);
    this.scene.add(gridHelper);

    // Add blue skybox with gradient (hemisphere above ground only, matching grid size)
    const skyGeo = new THREE.SphereGeometry(16, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x80bbff) }, // Lighter deep blue at top
        bottomColor: { value: new THREE.Color(0xc3e7f5) } // Lighter light blue at horizon
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

    this.camera.position.set(0, 5, 10);
    this.camera.lookAt(0, 0, 0);

    // Add OrbitControls for camera interaction
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 50;

    // Register render callback to timer if provided
    if (renderTimer) {
      this.renderTimer = renderTimer;
      renderTimer.register(() => this.render());
    }
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
