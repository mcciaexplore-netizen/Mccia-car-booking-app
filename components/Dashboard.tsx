import React, { useState } from 'react';
import { BrandContext, View } from '../types';
import ToolsGrid from './ToolsGrid';
import { TOOLS } from './toolsConfig';
import { LightbulbIcon } from './Icons';
import HeroGrid from './HeroGrid';

interface Props {
  setView: (view: View) => void;
  brand: BrandContext;
  searchQuery?: string;
}

const TIPS = [
  'Use clear and specific prompts for better results.',
  'Post consistently - a simple update beats silence.',
  'Add your city and product name so replies feel personal.',
  'Reuse your best captions as WhatsApp broadcasts too.'
];

const Dashboard: React.FC<Props> = ({ setView, brand, searchQuery }) => {
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <div className="relative overflow-hidden bg-slate-50 border border-slate-200 p-6 sm:p-8 rounded-card animate-entry">
        <HeroGrid />
        <div className="relative z-10">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-2">Welcome to</p>
          <h2 className="text-2xl sm:text-3xl font-heading text-ink tracking-tight">MCCIA Socials</h2>
          <p className="text-ink mt-2 font-medium leading-relaxed max-w-lg">
            Create, connect and share — all in one place for {brand.businessName || 'your business'}.
          </p>
          <button
            onClick={() => setView('tools')}
            className="mt-5 inline-flex items-center gap-2 bg-primary-gradient text-white px-5 py-2.5 rounded-btn text-sm font-bold shadow-btn hover:shadow-btn-hover hover:-translate-y-0.5 transition-all duration-300 ease-theme"
          >
            Explore Tools
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-end justify-between ml-1">
          <div>
            <h3 className="text-xs font-black text-ink uppercase tracking-[0.15em]">Your Tools</h3>
            <p className="text-sm text-ink font-medium">Choose a tool to get started</p>
          </div>
        </div>
        <ToolsGrid setView={setView} searchQuery={searchQuery} />
      </div>

      <div className="p-4 rounded-xl border border-slate-200 bg-white flex items-center gap-4">
        <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary flex items-center justify-center shrink-0">
          <LightbulbIcon className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-black text-muted uppercase tracking-widest">Quick Tip</p>
          <p className="text-sm text-ink font-medium">{tip}</p>
        </div>
        <button
          onClick={() => setShowGuide(true)}
          className="hidden sm:inline-flex shrink-0 items-center gap-1.5 text-primary px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-primary-50 transition-colors"
        >
          View Guide
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-6" onClick={() => setShowGuide(false)}>
          <div
            className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl p-6 sm:p-8 max-h-[85vh] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-xl font-black text-ink">Quick Guide</h3>
                <p className="text-sm text-subtle font-medium">Get the most out of MCCIA Socials</p>
              </div>
              <button onClick={() => setShowGuide(false)} className="p-2 -mr-2 -mt-2 hover:bg-slate-100 rounded-full transition-all text-subtle" aria-label="Close">
                ✕
              </button>
            </div>

            <div className="space-y-2 mb-6">
              {TIPS.map(t => (
                <div key={t} className="flex gap-3 p-3 rounded-lg bg-primary-50 text-muted text-sm font-medium">
                  <LightbulbIcon className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
                  {t}
                </div>
              ))}
            </div>

            <h4 className="text-xs font-black text-subtle uppercase tracking-[0.15em] mb-3">What each tool does</h4>
            <div className="space-y-3">
              {TOOLS.map(tool => (
                <div key={tool.view} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 text-primary flex items-center justify-center shrink-0">
                    <tool.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-ink">{tool.title}</p>
                    <p className="text-xs text-subtle font-medium">{tool.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
