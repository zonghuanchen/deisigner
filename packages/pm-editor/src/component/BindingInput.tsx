export function BindButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            className="shrink-0 w-5 h-5 flex items-center justify-center text-[10px] text-gray-600 hover:text-orange-400 hover:bg-orange-600/10 rounded transition-colors"
            onClick={onClick}
            title="绑定表达式"
        >🔗</button>
    );
}

export function BindingInput({
    path, expr, preview, onChange, onUnbind, label,
}: {
    path: string;
    expr: string;
    preview: string;
    onChange: (expr: string) => void;
    onUnbind: () => void;
    label: string;
}) {
    return (
        <div className="flex items-center gap-1.5 flex-1 min-w-0 pl-2 border-l-2 border-orange-500/40">
            {label && <span className="text-[11px] text-gray-500 font-mono w-4 shrink-0">{label}</span>}
            <input
                className="bg-orange-950/40 text-orange-300 text-[11px] font-mono rounded px-1.5 py-0.5 border border-orange-500/30 focus:border-orange-400 outline-none flex-1 min-w-0"
                value={expr}
                onChange={e => onChange(e.target.value)}
                placeholder="表达式"
            />
            <span className="text-[10px] text-emerald-400/70 font-mono shrink-0 tabular-nums">{preview}</span>
            <button
                className="shrink-0 w-5 h-5 flex items-center justify-center text-[10px] text-orange-400 hover:text-gray-300 hover:bg-gray-700/40 rounded transition-colors"
                onClick={onUnbind}
                title="解除绑定"
            >✕</button>
        </div>
    );
}
