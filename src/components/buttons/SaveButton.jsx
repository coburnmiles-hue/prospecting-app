import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";

export default function SaveButton({ onClick, isSaved, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center w-16 h-16 rounded-[1.5rem] border transition-all ${
        disabled
          ? "bg-slate-900 border-slate-700 text-slate-600 cursor-not-allowed"
          : isSaved
          ? "bg-pink-600 border-pink-500 text-white"
          : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
      }`}
    >
      {disabled ? (
        <>
          <Loader2 size={24} className="animate-spin" />
          <span className="text-[8px] font-black uppercase mt-1">Wait</span>
        </>
      ) : isSaved ? (
        <>
          <BookmarkCheck size={24} />
          <span className="text-[8px] font-black uppercase mt-1">Saved</span>
        </>
      ) : (
        <>
          <Bookmark size={24} />
          <span className="text-[8px] font-black uppercase mt-1">Save</span>
        </>
      )}
    </button>
  );
}
