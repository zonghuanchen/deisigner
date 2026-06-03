import { useEffect, useRef, useState } from 'react';
import { AppViewer, VIEWER_3D } from '../app';
import { UIContainer, SelectionPanel } from '../app/ui';
import { ModelPanel } from './components';
import { setupTestScene } from './testScene';
import { App as CoreApp } from '../core';
import { AddModelCommand, DrawWallCommand, CommandManager } from './command';

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
    cmdManager.register(new DrawWallCommand(viewer));
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
