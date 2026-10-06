
import React, { useState } from 'react';
import { generateReplyVariants, ReplyVariant } from '../geminiService';
import { BrandContext } from '../types';
import { CopyIcon, WhatsAppIcon } from './Icons';

interface Props {
  brand: BrandContext;
  onSave: (item: any) => void;
}

const ReplyAssistant: React.FC<Props> = ({ brand, onSave }) => {
  const [msg, setMsg] = useState('');
  const [context, setContext] = useState('');
  const [variants, setVariants] = useState<ReplyVariant[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [editedText, setEditedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleGenerate = async () => {
    if (!msg) return;
    setLoading(true);
    setVariants([]);
    setSelectedIdx(null);
    setSaved(false);
    try {
      const output = await generateReplyVariants(brand, msg, context);
      setVariants(output);
      if (output.length > 0) {
        setSelectedIdx(0);
        setEditedText(output[0].text);
      }
    } catch (e) {
      alert("Error generating replies.");
    } finally {
      setLoading(false);
    }
  };

  const selectVariant = (idx: number) => {
    setSelectedIdx(idx);
    setEditedText(variants[idx].text);
    setSaved(false);
  };

  const handleUseReply = () => {
    if (!editedText) return;
    onSave({ type: 'reply', content: editedText, status: 'published' });
    setSaved(true);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h2 className="text-3xl font-black text-ink tracking-tighter">Reply Assistant</h2>
        <p className="text-sm font-medium text-ink">Respond to customer queries with AI-generated replies.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-4 card-glass rounded-card p-6 md:p-9">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-subtle uppercase tracking-widest">Customer Query</span>
          </div>
          <div className="bg-green-50 p-3 rounded-xl border border-green-100 flex gap-2 items-start">
            <WhatsAppIcon className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <p className="text-xs text-green-800 font-medium">Paste the customer's message below.</p>
          </div>
          <textarea
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 h-28 outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-100 transition-all text-ink font-bold placeholder:text-subtle placeholder:font-medium"
            placeholder="e.g. Hi, can you tell me more about your workshop?"
            value={msg}
            onChange={e => setMsg(e.target.value)}
          />

          <div className="space-y-2">
            <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Context (optional)</label>
            <textarea
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 h-20 outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-100 transition-all text-ink font-medium text-sm placeholder:text-subtle"
              placeholder="Product, event or company details the AI should reference"
              value={context}
              onChange={e => setContext(e.target.value)}
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || !msg}
            className="w-full bg-primary-gradient text-white shadow-btn hover:shadow-btn-hover hover:-translate-y-0.5 py-4 rounded-btn font-black disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Drafting Replies...</span>
              </>
            ) : variants.length > 0 ? 'Regenerate' : 'Generate Replies'}
          </button>

          {variants.length > 0 && (
            <div className="space-y-2 pt-2">
              <span className="text-[10px] font-black text-subtle uppercase tracking-widest">Suggested Replies</span>
              {variants.map((v, i) => (
                <button
                  key={i}
                  onClick={() => selectVariant(i)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all flex items-start justify-between gap-3 ${
 selectedIdx === i ? 'border-primary bg-primary-50' : 'border-slate-200 bg-white hover:border-slate-200'
 }`}
                >
                  <div className="min-w-0">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${selectedIdx === i ? 'text-primary' : 'text-subtle'}`}>{v.style}</span>
                    <p className="text-xs text-ink font-medium truncate">{v.text}</p>
                  </div>
                  {selectedIdx === i && <span className="text-primary shrink-0">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card-glass rounded-card p-6 md:p-9 space-y-4 lg:sticky lg:top-24">
          <span className="text-[10px] font-black text-subtle uppercase tracking-widest">Reply Preview</span>
          {selectedIdx === null ? (
            <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <p className="text-subtle font-bold italic text-sm">Generate replies to preview one here.</p>
            </div>
          ) : (
            <>
              <textarea
                value={editedText}
                onChange={e => { setEditedText(e.target.value); setSaved(false); }}
                className="w-full bg-slate-50 p-5 rounded-xl text-base leading-relaxed text-ink font-bold border-l-4 border-primary shadow-inner min-h-[220px] outline-none focus:ring-4 focus:ring-primary-100"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => { navigator.clipboard.writeText(editedText); alert('Copied!'); }}
                  className="text-primary flex items-center gap-2 text-xs font-black bg-primary-50 px-4 py-2.5 rounded-full hover:bg-primary-100 transition-all active:scale-95"
                >
                  <CopyIcon className="w-4 h-4" /> Copy Reply
                </button>
                <button
                  onClick={handleUseReply}
                  className="bg-primary text-white px-5 py-2.5 rounded-full text-xs font-black active:scale-95 transition-all"
                >
                  {saved ? 'Saved ✓' : 'Use Reply'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReplyAssistant;
