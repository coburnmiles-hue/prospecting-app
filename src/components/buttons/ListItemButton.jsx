import { ChevronRight, X } from "lucide-react";

export default function ListItemButton({ onClick, isActive, title, subtitle, itemKey, onDelete, showDelete, metric, savedStatus }) {
  // savedStatus: 'saved' | 'unsaved' | undefined (no coloring for saved-view items)
  const colorClass = isActive
    ? "bg-indigo-600/40 border-indigo-500/60 text-white backdrop-blur-md"
    : savedStatus === "saved"
    ? "bg-emerald-900/15 border-emerald-600/30 hover:border-emerald-500/50 backdrop-blur-md"
    : savedStatus === "unsaved"
    ? "bg-amber-900/10 border-amber-600/20 hover:border-amber-500/40 backdrop-blur-md"
    : "bg-white/[0.04] border-white/[0.07] hover:border-white/[0.14] backdrop-blur-md";

  return (
    <button
      key={itemKey}
      onClick={onClick}
      className={`w-full text-left p-5 rounded-3xl border transition-all flex items-center justify-between group ${colorClass}`}
    >
      <div className="truncate flex-1">
        <div className="flex items-center gap-2">
          <h4 className="font-black uppercase truncate text-sm italic tracking-tight text-slate-100">
            {title}
          </h4>
          {metric && (
            <span className="text-emerald-400 font-black text-xs px-2 py-0.5 bg-emerald-500/10 rounded-lg border border-emerald-500/30 whitespace-nowrap">
              {metric}
            </span>
          )}
        </div>
        <p className="text-[9px] uppercase font-bold truncate mt-0.5 text-slate-500">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        {showDelete && onDelete && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="w-6 h-6 rounded-full bg-red-900/30 border border-red-700/50 flex items-center justify-center hover:bg-red-900/50 transition-colors cursor-pointer"
          >
            <X size={12} className="text-red-400" />
          </div>
        )}
        <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-300" />
      </div>
    </button>
  );
}
