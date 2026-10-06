import React from 'react';
import { ToolDef } from './toolsConfig';

interface Props {
  tool: ToolDef;
  onClick: () => void;
}

const ToolCard: React.FC<Props> = ({ tool, onClick }) => (
  <button
    onClick={onClick}
    className="group relative flex items-center gap-4 lg:flex-col lg:items-start lg:gap-0 p-4 lg:p-5 border border-slate-200 rounded-xl shadow-card hover:shadow-card-hover hover:border-primary-300 hover:bg-slate-50 hover:-translate-y-1 transition-all duration-300 ease-theme text-left bg-white active:scale-[0.99] w-full h-full"
  >
    <div className="w-11 h-11 lg:w-10 lg:h-10 flex items-center justify-center rounded-lg bg-slate-100 text-primary lg:mb-3 shrink-0 transition-transform duration-300 ease-theme group-hover:scale-110 group-hover:rotate-3">
      <tool.icon className="w-5 h-5" />
    </div>
    <div className="flex-1 lg:flex-none">
      <h3 className="font-bold text-ink group-hover:text-primary transition-colors">{tool.title}</h3>
      <p className="text-xs text-ink font-medium leading-tight mt-0.5">{tool.desc}</p>
    </div>
    <div className="text-subtle group-hover:text-primary transition-colors pr-2 lg:absolute lg:top-4 lg:right-4 lg:pr-0">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  </button>
);

export default ToolCard;
