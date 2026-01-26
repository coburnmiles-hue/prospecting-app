import { Loader2 } from "lucide-react";

export default function PrimaryButton({ onClick, disabled, loading, children, type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] flex justify-center items-center gap-2 transition-all disabled:opacity-70"
    >
      {loading ? <Loader2 className="animate-spin" size={18} /> : children}
    </button>
  );
}
