import { useCallback } from 'react';
import type { MaterialData } from '@designer/pm-engine';
import { TEXTURE_OPTIONS, requireTexture } from './constants';
import { SliderRow } from './SliderRow';

export function MaterialEditor({
    material,
    onChange,
}: {
    material: MaterialData;
    onChange: (update: Partial<MaterialData>) => void;
}) {
    const colorHex = material.color;
    const textureUrl = material.map ?? null;
    const hasTexture = !!material.map;

    const handleColor = useCallback((hex: string) => {
        onChange({ color: hex });
    }, [onChange]);

    const handleRoughness = useCallback((v: number) => {
        onChange({ roughness: v });
    }, [onChange]);

    const handleMetalness = useCallback((v: number) => {
        onChange({ metalness: v });
    }, [onChange]);

    const handleTexture = useCallback((url: string | undefined) => {
        onChange({ map: url });
    }, [onChange]);

    return (
        <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">外观</span>

            {/* Material picker: color + textures */}
            <div className="flex items-start gap-3">
                {/* Left: label */}
                <span className="text-[11px] text-gray-500 font-mono shrink-0 mt-1">材质</span>
                {/* Right: texture grid + color picker at bottom-right */}
                <div className="grid grid-cols-3 gap-1.5 flex-1 min-w-0">
                    {TEXTURE_OPTIONS.map(opt => (
                        <button
                            key={opt.url}
                            onClick={() => handleTexture(opt.url)}
                            className={`relative w-full aspect-square rounded overflow-hidden transition-colors ${
                                textureUrl === opt.url
                                    ? 'ring-2 ring-blue-500'
                                    : 'hover:opacity-80'
                            }`}
                            title={opt.label}
                        >
                            <img
                                src={requireTexture(opt.url)}
                                alt={opt.label}
                                className="w-full h-full object-cover"
                            />
                        </button>
                    ))}
                    {/* Spacer */}
                    <div />
                    {/* 无贴图 */}
                    <button
                        onClick={() => handleTexture(undefined)}
                        className={`w-full aspect-square rounded text-[11px] text-gray-400 flex items-center justify-center transition-colors ${
                            !hasTexture
                                ? 'bg-blue-600/20 ring-2 ring-blue-500'
                                : 'bg-gray-800 hover:bg-gray-700'
                        }`}
                    >
                        无
                    </button>
                    {/* Color picker - bottom right */}
                    <div className="relative w-full aspect-square">
                        <button
                            className="w-full h-full rounded flex flex-col items-center justify-center gap-0.5 text-[10px] text-gray-400 bg-gray-800 hover:bg-gray-700 transition-colors"
                            title="拾色器"
                        >
                            <span className="w-4 h-4 rounded-sm border border-gray-600" style={{ backgroundColor: colorHex }} />
                            {colorHex}
                        </button>
                        <input
                            type="color"
                            value={colorHex}
                            onChange={e => {
                                handleTexture(undefined);
                                handleColor(e.target.value);
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                    </div>
                </div>
            </div>

            {/* Roughness */}
            <div className="flex items-center gap-3">
                <span className="text-[11px] text-gray-500 font-mono w-8 shrink-0">粗糙度</span>
                <div className="flex-1 min-w-0">
                    <SliderRow label="" value={material.roughness} min={0} max={1} step={0.01} onChange={handleRoughness} />
                </div>
            </div>

            {/* Metalness */}
            <div className="flex items-center gap-3">
                <span className="text-[11px] text-gray-500 font-mono w-8 shrink-0">金属度</span>
                <div className="flex-1 min-w-0">
                    <SliderRow label="" value={material.metalness} min={0} max={1} step={0.01} onChange={handleMetalness} />
                </div>
            </div>
        </div>
    );
}
