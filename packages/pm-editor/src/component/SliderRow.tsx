export function SliderRow({
    label, value, min, max, step, onChange,
}: {
    label: string; value: number; min: number; max: number; step: number;
    onChange: (v: number) => void;
}) {
    return (
        <div className="flex items-center gap-2 pl-2">
            <span className="text-[11px] text-gray-500 font-mono w-4 shrink-0">{label}</span>
            <input
                type="range"
                min={min} max={max} step={step}
                value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                className="flex-1 accent-blue-500 h-1"
            />
            <span className="text-[11px] text-gray-300 font-mono w-10 text-right tabular-nums">
                {value.toFixed(2)}
            </span>
        </div>
    );
}
