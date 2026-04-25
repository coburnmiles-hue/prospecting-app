import { X } from "lucide-react";

export default function SearchInput({ value, onChange, placeholder, icon: Icon, id, name }) {
  return (
    <div className="relative">
      {Icon && <Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />}
      <input
        type="text"
        id={id}
        name={name}
        placeholder={placeholder}
        className={`w-full ${Icon ? 'pl-12' : 'pl-4'} ${value ? 'pr-10' : 'pr-4'} py-3.5 rounded-2xl glass-input text-white text-base outline-none transition-all uppercase placeholder:text-slate-500`}
        value={value}
        onChange={onChange}
      />
      {value && (
        <button
          onClick={() => onChange({ target: { value: '' } })}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          type="button"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
