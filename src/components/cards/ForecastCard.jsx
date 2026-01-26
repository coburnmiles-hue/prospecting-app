import { TrendingUp } from "lucide-react";
import { formatCurrency } from "../../utils/formatters";

export default function ForecastCard({ total }) {
  return (
    <div className="bg-emerald-600 p-6 rounded-[2rem] shadow-xl shrink-0 min-w-[180px]">
      <p className="text-[9px] font-black text-emerald-100 uppercase tracking-widest mb-1 flex items-center gap-2">
        <TrendingUp size={12} /> Monthly Forecast
      </p>
      <p className="text-3xl font-black text-white italic tracking-tighter leading-none">
        {formatCurrency(total || 0)}
      </p>
    </div>
  );
}
