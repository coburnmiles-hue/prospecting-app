export default function FilterInput({ value, onChange, placeholder }) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      className="w-full px-4 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-[10px] font-bold text-white outline-none focus:ring-1 focus:ring-indigo-600 uppercase placeholder:text-slate-600"
      value={value}
      onChange={onChange}
    />
  );
}
