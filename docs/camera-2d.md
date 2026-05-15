# Camera2D Display Component

## Overview
The `Camera2D` component renders a 2D visualization of the camera position and target in the PixiJS 2D view. It displays:
- **Blue circle**: Camera position
- **Orange circle**: Camera target (look-at point)
- **Dashed gray line**: Connection between position and target

Both points are draggable, and changes are synced back to the active `CameraModel`.

## Usage Example

```typescript
import { Camera2D } from './display/Camera';
import { App } from '../core';
import { Scene2D } from '../2d';

// After Scene2D is initialized
const app = App.getInstance();
const cameraManager = app.getCameraManager();
const activeCamera = cameraManager.getActiveCamera();

if (activeCamera && scene2D) {
    // Create a container for the camera display
    const cameraContainer = new PIXI.Container();
    scene2D.getStage().addChild(cameraContainer);
    
    // Create the 2D camera display
    const camera2D = new Camera2D(activeCamera, cameraContainer, scene2D);
    
    // The camera2D will automatically update when the camera model changes
    // and will sync drag interactions back to the camera model
}
```

## Integration with Scene2D

To integrate Camera2D into your Scene2D:

1. **Add getStage() method to Scene2D** (if not already present):
```typescript
getStage(): PIXI.Container {
    return this.app.stage;
}
```

2. **Create Camera2D instance** after Scene2D initialization:
```typescript
const cameraContainer = new PIXI.Container();
this.scene2d.getStage().addChild(cameraContainer);
this.camera2D = new Camera2D(activeCamera, cameraContainer, this.scene2d);
```

3. **Handle camera switching**:
When the active camera changes (via CameraManager), dispose the old Camera2D and create a new one:
```typescript
cameraManager.addEventListener('change', (event) => {
    if (this.camera2D) {
        this.camera2D.dispose();
    }
    this.camera2D = new Camera2D(event.camera, cameraContainer, this.scene2d);
});
```

## Features

- **Real-time synchronization**: Dragging points updates the CameraModel immediately
- **Event-driven updates**: Listens to CameraModel 'change' events to update visual representation
- **Visual distinction**: Different colors for position (blue) and target (orange)
- **Dashed line**: Visual connection shows camera viewing direction
- **Drag interaction**: Pointer-based dragging with proper event handling

## Configuration

The following visual parameters can be adjusted in `Camera.ts`:

```typescript
private readonly POINT_RADIUS = 8;                    // Size of draggable points
private readonly POINT_COLOR_POSITION = 0x0066ff;     // Blue for camera position
private readonly POINT_COLOR_TARGET = 0xff6600;       // Orange for target
private readonly LINE_COLOR = 0x999999;               // Gray for dashed line
private readonly LINE_WIDTH = 2;                      // Line thickness
private readonly DASH_LENGTH = 10;                    // Dash segment length
private readonly GAP_LENGTH = 5;                      // Gap between dashes
```

## Coordinate System

The component assumes a top-down 2D view where:
- The X and Y axes represent the ground plane
- The scale factor is configurable (default: 0.01, meaning 100 pixels = 1 unit)
- Screen coordinates are converted to world coordinates for camera updates

## Notes

- The Camera2D component only visualizes the X and Y coordinates of the camera
- Z-axis values are preserved during drag operations
- The component should be disposed when no longer needed to clean up event listeners
