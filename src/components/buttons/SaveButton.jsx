import { Bookmark, BookmarkCheck } from "lucide-react";

export default function SaveButton({ onClick, isSaved }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-16 h-16 rounded-[1.5rem] border transition-all ${
        isSaved
          ? "bg-pink-600 border-pink-500 text-white"
          : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
      }`}
    >
      {isSaved ? <BookmarkCheck size={24} /> : <Bookmark size={24} />}
      <span className="text-[8px] font-black uppercase mt-1">
        {isSaved ? "Saved" : "Save"}
      </span>
    </button>
  );
}
