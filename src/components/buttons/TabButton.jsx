export default function TabButton({ onClick, active, children, badge }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest relative ${
        active ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
      }`}
    >
      {children}
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md flex items-center justify-center border-2 border-[#1E293B] shadow-lg shadow-emerald-500/50">
          {badge}
        </span>
      )}
    </button>
  );
}
