import React from 'react';
import { View } from '../types';
import { HomeIcon, ToolsIcon, ContentIcon, HistoryIcon, SettingsIcon } from './Icons';
import { TOOLS } from './toolsConfig';

interface Props {
  view: View;
  contentSegment: 'content' | 'activity';
  onNavigate: (view: View, segment?: 'content' | 'activity') => void;
}

const Sidebar: React.FC<Props> = ({ view, contentSegment, onNavigate }) => {
  return (
    <aside className="hidden md:flex md:flex-col md:w-72 md:shrink-0 md:h-screen md:sticky md:top-0 border-r border-slate-200 bg-white/95 backdrop-blur-xl px-5 py-6 overflow-y-auto">
      <div className="flex items-center gap-2 px-2 mb-8">
        <img src="/mccia-logo.png" alt="MCCIA" className="h-8 w-auto" />
        <div className="leading-none">
          <p className="font-black text-primary tracking-tight text-sm">MCCIA</p>
          <p className="text-[9px] font-black uppercase text-subtle tracking-[0.3em]">Socials</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        <button
          onClick={() => onNavigate('dashboard')}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${
 view === 'dashboard' ? 'bg-primary-50 text-primary' : 'text-muted hover:bg-slate-50 hover:text-muted'
 }`}
        >
          <HomeIcon className="w-5 h-5" />
          Home
        </button>

        <div className="pt-4 pb-1 px-4 flex items-center gap-2">
          <ToolsIcon className="w-3.5 h-3.5 text-subtle" />
          <span className="text-[10px] font-black text-subtle uppercase tracking-widest">Tools</span>
        </div>
        {TOOLS.map(tool => (
          <button
            key={tool.view}
            onClick={() => onNavigate(tool.view)}
            className={`w-full flex items-center gap-3 pl-8 pr-4 py-2 rounded-lg text-[13px] font-bold whitespace-nowrap transition-colors ${
 view === tool.view ? 'bg-primary-50 text-primary' : 'text-muted hover:bg-slate-50 hover:text-muted'
 }`}
          >
            <tool.icon className="w-4 h-4 shrink-0" />
            {tool.title}
          </button>
        ))}

        <div className="pt-3 space-y-1">
          <button
            onClick={() => onNavigate('content', 'content')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${
 view === 'content' && contentSegment === 'content' ? 'bg-primary-50 text-primary' : 'text-muted hover:bg-slate-50 hover:text-muted'
 }`}
          >
            <ContentIcon className="w-5 h-5" />
            My Content
          </button>
          <button
            onClick={() => onNavigate('content', 'activity')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${
 view === 'content' && contentSegment === 'activity' ? 'bg-primary-50 text-primary' : 'text-muted hover:bg-slate-50 hover:text-muted'
 }`}
          >
            <HistoryIcon className="w-5 h-5" />
            History
          </button>
          <button
            onClick={() => onNavigate('settings')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${
 view === 'settings' ? 'bg-primary-50 text-primary' : 'text-muted hover:bg-slate-50 hover:text-muted'
 }`}
          >
            <SettingsIcon className="w-5 h-5" />
            Settings
          </button>
        </div>
      </nav>

      <div className="mt-6 p-4 rounded-lg bg-primary text-white">
        <p className="font-black tracking-tight">MCCIA</p>
        <p className="text-xs opacity-80 font-medium mt-1 leading-snug">Empowering Industries Through Innovation</p>
      </div>
    </aside>
  );
};

export default Sidebar;
