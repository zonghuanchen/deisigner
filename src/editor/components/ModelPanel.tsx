import { useState, useCallback } from 'react';
import * as THREE from 'three';
import { App as CoreApp, FurnitureModel } from '../../core';
import { useModelListener } from '../../app/ui';
import { AddModelEnvironment, EnvironmentManager } from '../env';

/**
 * GLB models available in /assets/
 * FlightHelmet.glb is 0 bytes so it is excluded
 */
const GLB_MODELS = [
    { name: 'ABeautifulGame', file: 'ABeautifulGame.glb' },
    { name: 'DamagedHelmet', file: 'DamagedHelmet.glb' },
    { name: 'IridescenceLamp', file: 'IridescenceLamp.glb' },
    { name: 'MaterialsVariantsShoe', file: 'MaterialsVariantsShoe.glb' },
    { name: 'PotOfCoals', file: 'PotOfCoals.glb' },
    { name: 'SheenChair', file: 'SheenChair.glb' },
    { name: 'SheenWoodLeatherSofa', file: 'SheenWoodLeatherSofa.glb' },
    { name: 'ToyCar', file: 'ToyCar.glb' },
    { name: 'Door Model', file: 'door-model.glb' },
];

type TabKey = 'models';

interface TabDef {
    key: TabKey;
    label: string;
}

const TABS: TabDef[] = [
    { key: 'models', label: '模型列表' },
];

/**
 * Right-side panel with tabbed interface.
 * The "模型列表" tab lists all available GLB assets and allows adding them to the scene.
 */
export function ModelPanel() {
    const [activeTab, setActiveTab] = useState<TabKey>('models');
    const [collapsed, setCollapsed] = useState(false);

    const selectionManager = CoreApp.getInstance().getSelectionManager();
    const selectionData = useModelListener(selectionManager);
    const hasSelection = (selectionData.count ?? 0) > 0;
    // SelectionPanel is w-72 (18rem); offset the left edge when it is visible
    const leftOffset = hasSelection ? 'left-72' : 'left-0';

    const handleAddModel = useCallback((file: string) => {
        const scene = CoreApp.getInstance().getScene();
        const floor = scene.defaultFloor;
        if (!floor) return;

        const gltfPath = `/assets/${file}`;
        const furniture = new FurnitureModel(
            gltfPath,
            new THREE.Vector3(0, 0, 0),
            new THREE.Euler(0, 0, 0),
            new THREE.Vector3(1, 1, 1),
        );
        floor.addFurniture(furniture);

        // Switch to AddModelEnvironment to let user place the model
        const envManager = EnvironmentManager.getInstance();
        const addModelEnv = envManager.getEnvironment('addModel') as AddModelEnvironment | undefined;
        if (addModelEnv) {
            addModelEnv.setModel(furniture);
            envManager.switchTo('addModel');
        }
    }, []);

    if (collapsed) {
        return (
            <div
                className={`absolute ${leftOffset} right-0 bottom-0 flex justify-center pointer-events-none`}
            >
                <button
                    className="pointer-events-auto bg-gray-900/80 border border-gray-700 border-b-0 rounded-t-md px-4 py-1.5 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                    style={{ backdropFilter: 'blur(8px)' }}
                    onClick={() => setCollapsed(false)}
                    title="展开模型面板"
                >
                    <span className="text-xs font-mono">▲</span>
                </button>
            </div>
        );
    }

    return (
        <div
            className={`absolute ${leftOffset} right-0 bottom-0 h-32 bg-gray-900/90 border-t border-gray-700 pointer-events-auto flex flex-col transition-[left] duration-200`}
            style={{ backdropFilter: 'blur(8px)' }}
        >
            {/* Header: tabs + collapse */}
            <div className="flex items-center border-b border-gray-700 shrink-0">
                <span className="px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide shrink-0">资源</span>
                <div className="flex h-full">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                activeTab === tab.key
                                    ? 'text-white border-b-2 border-blue-500 bg-gray-800/40'
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/20'
                            }`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="flex-1" />
                <button
                    className="px-3 text-gray-500 hover:text-white text-xs transition-colors"
                    onClick={() => setCollapsed(true)}
                    title="收起面板"
                >
                    ▼
                </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
                {activeTab === 'models' && (
                    <ModelListTab models={GLB_MODELS} onAdd={handleAddModel} />
                )}
            </div>
        </div>
    );
}

interface ModelItem {
    name: string;
    file: string;
}

function ModelListTab({ models, onAdd }: { models: ModelItem[]; onAdd: (file: string) => void }) {
    return (
        <div className="flex items-stretch gap-2 p-2 h-full min-w-min">
            {models.map(model => (
                <div
                    key={model.file}
                    className="flex flex-col items-center gap-1 px-2 py-1 rounded hover:bg-gray-800/60 group transition-colors cursor-pointer shrink-0 w-16"
                    onClick={() => onAdd(model.file)}
                    title={`添加 ${model.name} 到场景`}
                >
                    {/* Model icon placeholder */}
                    <div className="w-10 h-10 rounded bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0 group-hover:border-blue-500 transition-colors">
                        <span className="text-[10px] text-gray-500 font-mono">GLB</span>
                    </div>
                    {/* Model name */}
                    <span className="text-[10px] text-gray-400 truncate w-full text-center group-hover:text-white transition-colors">
                        {model.name}
                    </span>
                </div>
            ))}
        </div>
    );
}
