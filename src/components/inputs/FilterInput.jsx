import { X } from "lucide-react";

export default function FilterInput({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <input
        type="text"
        placeholder={placeholder}
        className={`w-full px-4 ${value ? 'pr-8' : 'pr-4'} py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-[10px] font-bold text-white outline-none focus:ring-1 focus:ring-indigo-600 uppercase placeholder:text-slate-600`}
        value={value}
        onChange={onChange}
      />
      {value && (
        <button
          onClick={() => onChange({ target: { value: '' } })}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          type="button"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
