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
        <span className="absolute -top-1 -right-1 bg-pink-500 text-[8px] text-white w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#1E293B]">
          {badge}
        </span>
      )}
    </button>
  );
}
