
import React, { useState } from 'react';
import { generateMonthlyPlan } from '../geminiService';
import { BrandContext, MonthlyPlanItem } from '../types';
import { CalendarIcon } from './Icons';

interface Props {
  brand: BrandContext;
}

const MonthlyPlanner: React.FC<Props> = ({ brand }) => {
  const [plan, setPlan] = useState<MonthlyPlanItem[]>([]);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const output = await generateMonthlyPlan(brand);
      setPlan(output);
    } catch (e) {
      alert("Error generating plan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-xl border border-slate-200 text-center">
        <div className="w-12 h-12 bg-slate-100 text-primary rounded-lg flex items-center justify-center mx-auto mb-5">
          <CalendarIcon className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-black text-ink mb-2">Monthly Content Outline</h3>
        <p className="text-muted mb-8 leading-relaxed font-medium">Generate a calendar of what to post. We only suggest topics to save tokens.</p>
        {!plan.length && (
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full bg-primary-gradient text-white shadow-btn hover:shadow-btn-hover hover:-translate-y-0.5 py-5 rounded-btn font-black disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-3 text-lg"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Planning...</span>
              </>
            ) : (
              'Generate 30-Day Plan'
            )}
          </button>
        )}
      </div>

      {plan.length > 0 && (
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-500 space-y-3">
          {plan.map((item, idx) => (
            <div key={idx} className="p-4 border border-slate-200 rounded-xl flex gap-4 items-start bg-white shadow-sm">
              <div className="bg-primary-50 text-primary font-black px-3 py-1.5 rounded-lg text-xs shrink-0 w-16 text-center">
                {item.date}
              </div>
              <div>
                <span className="text-[10px] uppercase font-black text-subtle tracking-widest">{item.type}</span>
                <p className="text-sm font-bold text-ink">{item.topic}</p>
              </div>
            </div>
          ))}
          <button
            onClick={() => setPlan([])}
            className="w-full text-center py-4 text-xs font-black text-subtle uppercase tracking-widest hover:text-primary transition-colors"
          >
            Clear and generate again
          </button>
        </div>
      )}
    </div>
  );
};

export default MonthlyPlanner;
