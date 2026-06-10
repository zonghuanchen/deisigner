import { useCallback } from 'react';
import { TRANSFORM_AXES } from './constants';
import { SliderRow } from './SliderRow';
import type { GlbModelItem } from './types';

export function GlbTransformEditor({
    model,
    onChange,
}: {
    model: GlbModelItem;
    onChange: (update: Partial<GlbModelItem>) => void;
}) {
    const setAxis = useCallback(
        (key: 'position' | 'rotation' | 'scale', axis: 'x' | 'y' | 'z', val: number) => {
            const cur = { ...model[key] };
            cur[axis] = val;
            onChange({ [key]: cur });
        },
        [model, onChange],
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
                        value={model.position[axis]}
                        min={-20} max={20} step={0.1}
                        onChange={v => setAxis('position', axis, v)}
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
                        value={model.rotation[axis]}
                        min={-Math.PI} max={Math.PI} step={0.01}
                        onChange={v => setAxis('rotation', axis, v)}
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
                        value={model.scale[axis]}
                        min={0.05} max={10} step={0.05}
                        onChange={v => setAxis('scale', axis, v)}
                    />
                ))}
            </div>
        </div>
    );
}
