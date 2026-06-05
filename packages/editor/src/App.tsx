import { useEffect, useRef, useState } from 'react';
import { AppViewer, VIEWER_3D } from '@designer/app';
import { UIContainer, SelectionPanel } from '@designer/app/ui';
import { ModelPanel } from './components';
import { setupTestScene } from './testScene';
import { App as CoreApp } from '@designer/core';
import { AddModelCommand, AddHostModelCommand, DrawWallCommand, MoveModelCommand, MoveHostModelCommand, isDraggable, isHostModel, CommandManager } from './command';
import { SelectionManager } from '@designer/core';

export const viewer = new AppViewer({ defaultPrimary: VIEWER_3D });
viewer.init(
    document.querySelector('#editor-3d')!, 
    document.querySelector('#editor-2d')!
).then(() => {
    // Setup test scene after viewer is initialized
    const scene = CoreApp.getInstance().getScene();
    setupTestScene(scene);
    viewer.render();

    // Register commands
    const cmdManager = CommandManager.getInstance();
    cmdManager.register(new AddModelCommand(viewer));
    cmdManager.register(new AddHostModelCommand(viewer));
    cmdManager.register(new DrawWallCommand(viewer));
    const moveCmd = new MoveModelCommand(viewer);
    cmdManager.register(moveCmd);
    const moveHostCmd = new MoveHostModelCommand(viewer);
    cmdManager.register(moveHostCmd);

    // Activate the appropriate move command when a model is selected
    const selectionManager = SelectionManager.getInstance();
    selectionManager.addEventListener('select', ((e: any) => {
        // Skip auto-move while AddHostModelCommand is actively placing the model
        if (cmdManager.currentName === 'addHostModel') return;

        const pos = viewer.getLastPointerPosition();
        if (!pos) return;
        if (isDraggable(e.model)) {
            // Ordinary furniture model -> MoveModelCommand
            moveCmd.setModel(e.model, pos.clientX, pos.clientY);
            cmdManager.execute('moveModel');
        } else if (isHostModel(e.model)) {
            // Host model (parametric, door, window) -> MoveHostModelCommand
            moveHostCmd.setModel(e.model, pos.clientX, pos.clientY);
            cmdManager.execute('moveHostModel');
        }
    }) as any);

    // Deactivate move commands when selection is cleared
    selectionManager.addEventListener('clear', (() => {
        const name = cmdManager.currentName;
        if (name === 'moveModel' || name === 'moveHostModel') {
            cmdManager.completeCurrent();
        }
    }) as any);

    // Deactivate move commands when any model is deselected
    selectionManager.addEventListener('deselect', (() => {
        const name = cmdManager.currentName;
        if (name === 'moveModel' || name === 'moveHostModel') {
            cmdManager.completeCurrent();
        }
    }) as any);
});

export function App() {

    return (
        <div>
            <UIContainer>
                <SelectionPanel />
                <ModelPanel />
                <div className="p-4 pointer-events-auto">
                    <h1 className="text-xl font-bold mb-4 text-white">designer</h1>
                    <p className="text-sm text-gray-300">2D视图已固定为右上角浮动窗口</p>
                </div>
            </UIContainer>
        </div>
    );
}
