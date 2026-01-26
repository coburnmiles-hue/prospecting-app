import { ChevronRight } from "lucide-react";

export default function ListItemButton({ onClick, isActive, title, subtitle, itemKey }) {
  return (
    <button
      key={itemKey}
      onClick={onClick}
      className={`w-full text-left p-5 rounded-3xl border transition-all flex items-center justify-between group ${
        isActive ? "bg-indigo-700 border-indigo-500 text-white" : "bg-[#1E293B] border-slate-700 hover:border-slate-500"
      }`}
    >
      <div className="truncate">
        <h4 className="font-black uppercase truncate text-sm italic tracking-tight text-slate-100">
          {title}
        </h4>
        <p className="text-[9px] uppercase font-bold truncate mt-0.5 text-slate-500">{subtitle}</p>
      </div>
      <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-300" />
    </button>
  );
}
