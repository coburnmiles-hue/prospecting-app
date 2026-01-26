export default function TextArea({ value, onChange, placeholder, className = "" }) {
  return (
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className={`w-full bg-[#0F172A] border border-slate-700 rounded-2xl p-4 text-[11px] font-bold text-slate-200 outline-none min-h-[70px] resize-none ${className}`}
    />
  );
}
