import { useCallback } from 'react';
import type { ParametricDef } from '@designer/pm-engine';
import { TRANSFORM_AXES } from './constants';
import { SliderRow } from './SliderRow';

export function TransformEditor({
    def,
    onChange,
}: {
    def: ParametricDef;
    onChange: (newDef: ParametricDef) => void;
}) {
    const pos = def.position ?? { x: 0, y: 0, z: 0 };
    const rot = def.rotation ?? { x: 0, y: 0, z: 0 };
    const scl = def.scale ?? { x: 1, y: 1, z: 1 };

    const setVec = useCallback(
        (key: 'position' | 'rotation' | 'scale', axis: 'x' | 'y' | 'z', val: number) => {
            const cur = { ...(def[key] ?? (key === 'scale' ? { x: 1, y: 1, z: 1 } : { x: 0, y: 0, z: 0 })) };
            cur[axis] = val;
            onChange({ ...def, [key]: cur });
        },
        [def, onChange],
    );

    return (
        <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">变换</span>

            {/* Position */}
            <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-emerald-400/70 font-mono">位置</span>
                {TRANSFORM_AXES.map(axis => (
                    <SliderRow
                        key={axis}
                        label={axis.toUpperCase()}
                        value={pos[axis]}
                        min={-10} max={10} step={0.1}
                        onChange={v => setVec('position', axis, v)}
                    />
                ))}
            </div>

            {/* Rotation */}
            <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-purple-400/70 font-mono">旋转</span>
                {TRANSFORM_AXES.map(axis => (
                    <SliderRow
                        key={axis}
                        label={axis.toUpperCase()}
                        value={rot[axis]}
                        min={-Math.PI} max={Math.PI} step={0.01}
                        onChange={v => setVec('rotation', axis, v)}
                    />
                ))}
            </div>

            {/* Scale */}
            <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-amber-400/70 font-mono">缩放</span>
                {TRANSFORM_AXES.map(axis => (
                    <SliderRow
                        key={axis}
                        label={axis.toUpperCase()}
                        value={scl[axis]}
                        min={0.05} max={5} step={0.05}
                        onChange={v => setVec('scale', axis, v)}
                    />
                ))}
            </div>
        </div>
    );
}
