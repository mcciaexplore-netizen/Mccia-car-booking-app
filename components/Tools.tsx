import React from 'react';
import { View } from '../types';
import ToolsGrid from './ToolsGrid';

interface Props {
  setView: (view: View) => void;
  searchQuery: string;
}

const Tools: React.FC<Props> = ({ setView, searchQuery }) => (
  <div className="space-y-6 animate-slide-up">
    <div>
      <h2 className="text-3xl font-black text-ink tracking-tighter">Tools</h2>
      <p className="text-sm font-medium text-ink">Every content tool in one place</p>
    </div>
    <ToolsGrid setView={setView} searchQuery={searchQuery} />
  </div>
);

export default Tools;
