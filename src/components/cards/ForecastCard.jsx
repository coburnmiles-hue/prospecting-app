import { TrendingUp } from "lucide-react";
import { formatCurrency } from "../../utils/formatters";

export default function ForecastCard({ total, isActualGpv }) {
  return (
    <div className="bg-emerald-600 p-6 rounded-[2rem] shadow-xl shrink-0 min-w-[180px]">
      <p className="text-[9px] font-black text-emerald-100 uppercase tracking-widest mb-1 flex items-center gap-2">
        <TrendingUp size={12} /> {isActualGpv ? 'Actual GPV' : 'Monthly Forecast'}
      </p>
      <p className="text-3xl font-black text-white italic tracking-tighter leading-none">
        {formatCurrency(total || 0)}
      </p>
      {isActualGpv && (
        <p className="text-[8px] font-bold text-emerald-200 mt-1 uppercase tracking-widest">Signed · Actual</p>
      )}
    </div>
  );
}
