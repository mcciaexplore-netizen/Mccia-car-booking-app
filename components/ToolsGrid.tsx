import React from 'react';
import { View } from '../types';
import { TOOLS } from './toolsConfig';
import ToolCard from './ToolCard';

interface Props {
  setView: (view: View) => void;
  searchQuery?: string;
}

const ToolsGrid: React.FC<Props> = ({ setView, searchQuery }) => {
  const query = (searchQuery || '').trim().toLowerCase();
  const tools = query
    ? TOOLS.filter(t => t.title.toLowerCase().includes(query) || t.desc.toLowerCase().includes(query))
    : TOOLS;

  if (tools.length === 0) {
    return (
      <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-200">
        <p className="text-subtle font-bold italic">No tools match "{searchQuery}".</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {tools.map((tool, i) => (
        <div key={tool.view} className="animate-entry h-full" style={{ animationDelay: `${i * 80}ms` }}>
          <ToolCard tool={tool} onClick={() => setView(tool.view)} />
        </div>
      ))}
    </div>
  );
};

export default ToolsGrid;
