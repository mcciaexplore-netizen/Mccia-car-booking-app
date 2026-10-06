import React, { useMemo, useState } from 'react';
import { ContentStatus, HistoryItem } from '../types';
import { TrashIcon, ContentIcon, HistoryIcon, SearchIcon, FolderIcon } from './Icons';

type Segment = 'content' | 'activity';
type TypeTab = 'all' | 'post' | 'offer' | 'message' | 'prompt';

interface Props {
  history: HistoryItem[];
  segment: Segment;
  onSegmentChange: (segment: Segment) => void;
  onExport: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<HistoryItem>) => void;
}

const TYPE_TABS: { key: TypeTab, label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'post', label: 'Posts' },
  { key: 'offer', label: 'Offers' },
  { key: 'message', label: 'Messages' },
  { key: 'prompt', label: 'Images' }
];

const FILTERS = ['all', 'post', 'offer', 'reply', 'broadcast', 'prompt'] as const;

const TYPE_DOT: Record<string, string> = {
  post: 'bg-purple-500',
  offer: 'bg-orange-500',
  reply: 'bg-green-500',
  broadcast: 'bg-blue-500',
  prompt: 'bg-pink-500'
};

const STATUS_STYLE: Record<ContentStatus, string> = {
  draft: 'bg-slate-100 text-muted',
  scheduled: 'bg-primary-50 text-primary',
  published: 'bg-green-50 text-green-600'
};

const matchesTab = (item: HistoryItem, tab: TypeTab) => {
  if (tab === 'all') return true;
  if (tab === 'message') return item.type === 'reply' || item.type === 'broadcast';
  return item.type === tab;
};

const STATUS_OPTIONS: ContentStatus[] = ['draft', 'scheduled', 'published'];

const StatusBadge: React.FC<{ status: ContentStatus, onChange: (s: ContentStatus) => void }> = ({ status, onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 px-3 py-1 rounded-full text-[10px] uppercase font-black transition-all ring-1 ring-current ${STATUS_STYLE[status]}`}
      >
        {status}
        <span className="text-[8px]">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[110px]">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => { onChange(s); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-[10px] uppercase font-black transition-all ${s === status ? STATUS_STYLE[s] : 'text-muted hover:bg-slate-50'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const MetricsRow: React.FC<{ item: HistoryItem, onUpdate: (id: string, updates: Partial<HistoryItem>) => void }> = ({ item, onUpdate }) => {
  const [editing, setEditing] = useState(false);
  const [views, setViews] = useState(item.metrics?.views?.toString() || '');
  const [likes, setLikes] = useState(item.metrics?.likes?.toString() || '');
  const [comments, setComments] = useState(item.metrics?.comments?.toString() || '');

  if (item.status !== 'published') return null;

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-200">
        <span className="text-[10px] font-black text-subtle uppercase tracking-widest">Log performance:</span>
        <input value={views} onChange={e => setViews(e.target.value)} placeholder="Views" type="number" className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-ink" />
        <input value={likes} onChange={e => setLikes(e.target.value)} placeholder="Likes" type="number" className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-ink" />
        <input value={comments} onChange={e => setComments(e.target.value)} placeholder="Comments" type="number" className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-ink" />
        <button
          onClick={() => {
            onUpdate(item.id, { metrics: { views: Number(views) || undefined, likes: Number(likes) || undefined, comments: Number(comments) || undefined } });
            setEditing(false);
          }}
          className="text-xs font-black text-white bg-primary px-3 py-1.5 rounded-lg"
        >
          Save
        </button>
        <button onClick={() => setEditing(false)} className="text-xs font-black text-subtle">Cancel</button>
      </div>
    );
  }

  const hasMetrics = item.metrics && (item.metrics.views || item.metrics.likes || item.metrics.comments);
  return (
    <div className="flex items-center justify-between pt-3 border-t border-slate-200">
      {hasMetrics ? (
        <div className="flex items-center gap-4 text-xs font-bold text-muted">
          {item.metrics?.views != null && <span>👁 {item.metrics.views.toLocaleString()}</span>}
          {item.metrics?.likes != null && <span>♥ {item.metrics.likes.toLocaleString()}</span>}
          {item.metrics?.comments != null && <span>💬 {item.metrics.comments.toLocaleString()}</span>}
        </div>
      ) : (
        <span className="text-xs text-subtle italic font-medium">No performance logged yet</span>
      )}
      <button onClick={() => setEditing(true)} className="text-[10px] font-black text-primary hover:underline uppercase tracking-widest">
        {hasMetrics ? 'Edit' : '+ Log Performance'}
      </button>
    </div>
  );
};

const ContentHub: React.FC<Props> = ({ history, segment, onSegmentChange, onExport, onDelete, onUpdate }) => {
  const [filter, setFilter] = useState<typeof FILTERS[number]>('all');
  const [typeTab, setTypeTab] = useState<TypeTab>('all');
  const [search, setSearch] = useState('');

  const contentFiltered = useMemo(() => {
    let items = history.filter(item => matchesTab(item, typeTab));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(item => item.content.toLowerCase().includes(q));
    }
    return items;
  }, [history, typeTab, search]);

  const activityFiltered = filter === 'all' ? history : history.filter(item => item.type === filter);

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-black text-ink tracking-tighter">
            {segment === 'content' ? 'My Content' : 'Activity Log'}
          </h2>
          <p className="text-sm font-medium text-ink">
            {segment === 'content' ? 'Manage and track all your content in one place' : 'Cloud-synced history of every action'}
          </p>
        </div>
        {segment === 'activity' && history.length > 0 && (
          <button onClick={onExport} className="bg-primary text-white px-5 py-2.5 rounded-full text-xs font-black active:scale-95 transition-all">
            Export CSV
          </button>
        )}
      </div>

      <div className="flex bg-slate-100 p-1.5 rounded-xl w-full sm:w-fit">
        <button
          onClick={() => onSegmentChange('content')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${segment === 'content' ? 'bg-white text-primary shadow-md' : 'text-subtle hover:text-muted'}`}
        >
          <ContentIcon className="w-4 h-4" /> My Content
        </button>
        <button
          onClick={() => onSegmentChange('activity')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${segment === 'activity' ? 'bg-white text-primary shadow-md' : 'text-subtle hover:text-muted'}`}
        >
          <HistoryIcon className="w-4 h-4" /> Activity
        </button>
      </div>

      {segment === 'content' ? (
        <>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {TYPE_TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTypeTab(t.key)}
                  className={`shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${typeTab === t.key ? 'bg-primary text-white' : 'bg-slate-100 text-subtle hover:bg-slate-200'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-64 shrink-0">
              <SearchIcon className="w-4 h-4 text-subtle absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search content..."
                className="w-full bg-slate-50 border border-slate-200 rounded-full pl-10 pr-4 py-2.5 text-sm font-medium text-ink placeholder:text-subtle outline-none focus:border-primary-300 focus:bg-white focus:ring-4 focus:ring-primary-100 transition-all"
              />
            </div>
          </div>

          {contentFiltered.length === 0 ? (
            <div className="text-center py-24 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <FolderIcon className="w-8 h-8 text-subtle mx-auto mb-3" />
              <p className="text-subtle font-bold italic">Nothing here yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {contentFiltered.map(item => {
                const status: ContentStatus = item.status || 'draft';
                const isImage = item.type === 'prompt' && item.meta?.kind === 'image';
                const displayDate = status === 'scheduled' && item.scheduledAt ? item.scheduledAt : item.timestamp;
                return (
                  <div key={item.id} className="p-6 border border-slate-200 rounded-xl bg-white hover:shadow-lg transition-all">
                    <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-3 py-1 rounded-full text-[10px] uppercase font-black bg-primary-50 text-primary ring-1 ring-primary-150">{item.type}</span>
                        <StatusBadge status={status} onChange={s => onUpdate(item.id, { status: s })} />
                      </div>
                      <span className="text-[10px] font-bold text-subtle tracking-tighter uppercase">
                        {status === 'scheduled' ? 'Scheduled: ' : ''}{new Date(displayDate).toLocaleDateString()}
                      </span>
                    </div>

                    {isImage ? (
                      <div className="flex gap-4">
                        <img src={item.content} alt="Design" className="w-24 h-24 rounded-xl object-cover shrink-0" />
                        <p className="text-sm text-ink font-bold leading-relaxed line-clamp-4">{item.meta?.prompt || 'Generated design'}</p>
                      </div>
                    ) : (
                      <p className="text-[15px] text-ink whitespace-pre-wrap line-clamp-4 font-bold leading-relaxed">{item.content}</p>
                    )}

                    <MetricsRow item={item} onUpdate={onUpdate} />

                    <div className="mt-4 flex justify-end items-center gap-5">
                      <button
                        onClick={() => { if (confirm('Delete this item?')) onDelete(item.id); }}
                        className="text-subtle hover:text-red-500 transition-colors"
                        aria-label="Delete"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                      {!isImage && (
                        <button onClick={() => { navigator.clipboard.writeText(item.content); alert('Copied!'); }} className="text-xs font-black text-primary hover:underline">Copy Again</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {history.length > 0 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {FILTERS.map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-primary text-white' : 'bg-slate-100 text-subtle hover:bg-slate-200'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}

          {activityFiltered.length === 0 ? (
            <div className="text-center py-24 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <FolderIcon className="w-8 h-8 text-subtle mx-auto mb-3" />
              <p className="text-subtle font-bold italic">Nothing here yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activityFiltered.map(item => {
                const d = new Date(item.timestamp);
                return (
                  <div key={item.id} className="flex items-center gap-4 p-4 border border-slate-200 rounded-xl bg-white shadow-sm">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${TYPE_DOT[item.type] || 'bg-slate-400'}`}></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-ink truncate">{item.type === 'prompt' && item.meta?.kind === 'image' ? (item.meta?.prompt || 'Generated design') : item.content.replace(/\n/g, ' ')}</p>
                      <p className="text-[10px] font-black text-subtle uppercase tracking-widest">{item.type} · {d.toLocaleDateString()} {d.toLocaleTimeString()}</p>
                    </div>
                    <button
                      onClick={() => { if (confirm('Delete this item?')) onDelete(item.id); }}
                      className="text-subtle hover:text-red-500 transition-colors shrink-0"
                      aria-label="Delete"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ContentHub;
