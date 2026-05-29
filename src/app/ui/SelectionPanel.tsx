import { App as CoreApp } from '../../core';
import { useModelListener } from './util/useModelListener';

const TYPE_LABELS: Record<string, string> = {
    WallModel: '墙体',
    RoomModel: '房间',
    FloorModel: '楼层',
    FurnitureModel: '家具',
    ParametricModel: '参数化模型',
    FaceModel: '面',
    GroundModel: '地面',
    CeilingModel: '天花板',
    SceneModel: '场景',
    CameraModel: '相机',
};

function getModelType(obj: Record<string, any>): string {
    // Try to infer type from known keys
    if (obj.from && obj.to) return 'WallModel';
    if (obj.outerContour && obj.height !== undefined && obj.groundFace) return 'RoomModel';
    if (obj.outerContour && obj.material) return 'FaceModel';
    if (obj.floorNumber !== undefined) return 'FloorModel';
    if (obj.gltfPath !== undefined) return 'FurnitureModel';
    if (obj.params !== undefined) return 'ParametricModel';
    if (obj.floors !== undefined) return 'SceneModel';
    if (obj.cameraType !== undefined) return 'CameraModel';
    return 'Unknown';
}

function formatValue(v: any): string {
    if (v === null || v === undefined) return '-';
    if (typeof v === 'number') return Math.round(v * 100) / 100 + '';
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? '是' : '否';
    if (Array.isArray(v)) {
        if (v.length === 0) return '[]';
        if (typeof v[0] === 'object') return `[ ${v.length} 项 ]`;
        return v.map(formatValue).join(', ');
    }
    if (typeof v === 'object') {
        const keys = Object.keys(v);
        if (keys.length <= 3) {
            return keys.map(k => `${k}: ${formatValue(v[k])}`).join('  ');
        }
        return `{ ${keys.length} 属性 }`;
    }
    return String(v);
}

export function SelectionPanel() {
    const selectionManager = CoreApp.getInstance().getSelectionManager();
    const data = useModelListener(selectionManager);

    const count = data.count ?? 0;
    const first = data.first ?? null;

    if (count === 0 || !first) return null;

    const typeKey = getModelType(first);
    const label = TYPE_LABELS[typeKey] ?? typeKey;

    const props = Object.entries(first).filter(([k]) => k !== 'id');

    return (
        <div
            className="absolute left-0 top-0 bottom-0 w-72 bg-gray-900/90 border-r border-gray-700 pointer-events-auto overflow-y-auto flex flex-col"
            style={{ backdropFilter: 'blur(8px)' }}
        >
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">属性面板</span>
                    {count > 1 && (
                        <span className="text-xs bg-blue-600 text-white rounded px-1.5 py-0.5">{count}</span>
                    )}
                </div>
                <button
                    className="text-gray-400 hover:text-white text-xs"
                    onClick={() => selectionManager.clear()}
                >
                    取消选择
                </button>
            </div>

            {/* Model type */}
            <div className="px-4 py-3 border-b border-gray-700/60">
                <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-400" />
                    <span className="text-sm font-medium text-white">{label}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500 font-mono truncate">{first.id}</p>
            </div>

            {/* Properties */}
            <div className="px-4 py-3 flex flex-col gap-2 flex-1">
                {props.map(([key, value]) => (
                    <div key={key} className="flex flex-col gap-0.5">
                        <span className="text-xs text-gray-400 font-medium">{key}</span>
                        <span className="text-sm text-gray-100 break-all leading-relaxed">{formatValue(value)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
