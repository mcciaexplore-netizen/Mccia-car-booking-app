import React from 'react';
import { View } from '../types';
import { HomeIcon, HistoryIcon } from './Icons';

interface Props {
  view: View;
  contentSegment: 'content' | 'activity';
  onNavigate: (view: View, segment?: 'content' | 'activity') => void;
}

const BottomNav: React.FC<Props> = ({ view, onNavigate }) => (
  <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-200 flex justify-around py-5 z-30 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.05)]">
    <button onClick={() => onNavigate('dashboard')} className={`flex flex-col items-center gap-1.5 ${view === 'dashboard' ? 'text-primary' : 'text-subtle'}`}>
      <HomeIcon className={`w-6 h-6 transition-transform ${view === 'dashboard' ? 'scale-110' : ''}`} />
      <span className="text-[10px] font-black uppercase tracking-widest">Home</span>
    </button>
    <button onClick={() => onNavigate('content', 'content')} className={`flex flex-col items-center gap-1.5 ${view === 'content' ? 'text-primary' : 'text-subtle'}`}>
      <HistoryIcon className={`w-6 h-6 transition-transform ${view === 'content' ? 'scale-110' : ''}`} />
      <span className="text-[10px] font-black uppercase tracking-widest">History</span>
    </button>
  </nav>
);

export default BottomNav;
