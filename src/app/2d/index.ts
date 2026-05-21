import { Application } from 'pixi.js';
import * as THREE from 'three';

import { RenderTimer } from '../timer';

// Import 2D display modules to trigger their registration
import './display/Camera';

export class Scene2D extends THREE.EventDispatcher<any> {
    private static instance: Scene2D | null = null;
    private app: Application;
    private renderTimer: RenderTimer | null = null;
    private initialized: boolean = false;
    
    // Pan and zoom state
    private isPanning: boolean = false;
    private lastPanPosition: { x: number; y: number } = { x: 0, y: 0 };
    private panOffset: { x: number; y: number } = { x: 0, y: 0 };
    private zoomScale: number = 1;
    private isDraggingCameraPoint: boolean = false;

    constructor() {
        super();
        this.app = new Application();
        Scene2D.instance = this;
    }

    /**
     * Get the singleton instance of Scene2D
     * Creates a new instance if one doesn't exist
     */
    static getInstance(): Scene2D {
        if (!Scene2D.instance) {
            Scene2D.instance = new Scene2D();
        }
        return Scene2D.instance;
    }

    async init(container: HTMLElement, renderTimer?: RenderTimer) {
        await this.app.init({
            width: 400,
            height: 400,
            backgroundColor: 0xf5f5f5,
        });
        container.appendChild(this.app.canvas);
        
        // Setup pan and zoom interactions
        this.setupPanAndZoom();
        
        this.initialized = true;
        this.dispatchEvent({ type: 'initialized' });
        // Register render callback to timer if provided
        if (renderTimer) {
            this.renderTimer = renderTimer;
            renderTimer.register(() => this.render());
        }
    }

    render() {
        // Pixi.js automatically renders in the ticker loop
        // This method can be used for manual rendering if needed
        this.app.render();
    }
    
    /**
     * Setup pan and zoom interactions
     */
    private setupPanAndZoom(): void {
        const canvas = this.app.canvas;
        
        // Mouse down - start panning
        canvas.addEventListener('mousedown', (event: MouseEvent) => {
            // Don't start panning if dragging a camera point
            if (this.isDraggingCameraPoint) return;
            
            this.isPanning = true;
            this.lastPanPosition = { x: event.clientX, y: event.clientY };
            canvas.style.cursor = 'grabbing';
        });
        
        // Mouse move - pan
        canvas.addEventListener('mousemove', (event: MouseEvent) => {
            if (!this.isPanning) return;
            
            const deltaX = event.clientX - this.lastPanPosition.x;
            const deltaY = event.clientY - this.lastPanPosition.y;
            
            this.panOffset.x += deltaX;
            this.panOffset.y += deltaY;
            
            this.lastPanPosition = { x: event.clientX, y: event.clientY };
            
            // Update stage position
            this.app.stage.position.set(this.panOffset.x, this.panOffset.y);
        });
        
        // Mouse up - stop panning
        canvas.addEventListener('mouseup', () => {
            this.isPanning = false;
            canvas.style.cursor = 'grab';
        });
        
        // Mouse leave - stop panning
        canvas.addEventListener('mouseleave', () => {
            this.isPanning = false;
            canvas.style.cursor = 'grab';
        });
        
        // Mouse wheel - zoom
        canvas.addEventListener('wheel', (event: WheelEvent) => {
            event.preventDefault();
            
            const zoomFactor = 0.1;
            const delta = event.deltaY > 0 ? -zoomFactor : zoomFactor;
            const newScale = Math.max(0.1, Math.min(5, this.zoomScale + delta));
            
            // Calculate zoom center (mouse position relative to canvas)
            const rect = canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            
            // Adjust pan offset to zoom towards mouse position
            const scaleChange = newScale / this.zoomScale;
            this.panOffset.x = mouseX - (mouseX - this.panOffset.x) * scaleChange;
            this.panOffset.y = mouseY - (mouseY - this.panOffset.y) * scaleChange;
            
            this.zoomScale = newScale;
            
            // Update stage transform
            this.app.stage.position.set(this.panOffset.x, this.panOffset.y);
            this.app.stage.scale.set(this.zoomScale);
        }, { passive: false });
        
        // Set initial cursor
        canvas.style.cursor = 'grab';
    }

    /**
     * Get the underlying PixiJS canvas element
     */
    getCanvas(): HTMLCanvasElement | null {
        return this.initialized ? this.app.canvas : null;
    }

    /**
     * Check if Scene2D has been initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get the PixiJS stage container
     */
    getStage(): import('pixi.js').Container {
        return this.app.stage;
    }
    
    /**
     * Get the current zoom scale
     */
    getZoomScale(): number {
        return this.zoomScale;
    }
    
    /**
     * Get the current pan offset
     */
    getPanOffset(): { x: number; y: number } {
        return { ...this.panOffset };
    }
    
    /**
     * Set whether a camera point is being dragged
     */
    setDraggingCameraPoint(isDragging: boolean): void {
        this.isDraggingCameraPoint = isDragging;
    }
}
