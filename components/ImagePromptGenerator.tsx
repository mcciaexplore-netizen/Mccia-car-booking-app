
import React, { useState } from 'react';
import { generateImageAsset } from '../geminiService';
import { BrandContext, HistoryItem } from '../types';
import { TrashIcon, PaletteIcon } from './Icons';

interface Props {
  brand: BrandContext;
  history: HistoryItem[];
  onSave: (item: any) => void;
  onDelete: (id: string) => void;
}

type Tab = 'templates' | 'prompt' | 'designs';

const CATEGORIES = ['Events', 'Offers', 'Business', 'Festivals', 'Announcements', 'Social Media', 'Workshops'];
const STYLES = ['Professional', 'Modern', 'Minimal', 'Corporate'];
const FORMATS: { label: string, ratio: string }[] = [
  { label: '1:1', ratio: '1:1' },
  { label: '4:5', ratio: '3:4' },
  { label: '16:9', ratio: '16:9' },
  { label: '9:16', ratio: '9:16' }
];

const TEMPLATE_STARTERS: Record<string, string> = {
  Events: 'A promotional graphic for an upcoming business event',
  Offers: 'A promotional graphic announcing a special discount or offer',
  Business: 'A professional graphic representing a growing business',
  Festivals: 'A festive celebratory graphic for a seasonal greeting',
  Announcements: 'A clean announcement graphic sharing important news',
  'Social Media': 'An eye-catching social media post graphic',
  Workshops: 'A graphic promoting an educational workshop or training session'
};

const ImagePromptGenerator: React.FC<Props> = ({ brand, history, onSave, onDelete }) => {
  const [tab, setTab] = useState<Tab>('templates');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState(STYLES[0]);
  const [format, setFormat] = useState(FORMATS[0]);
  const [matchBrandColors, setMatchBrandColors] = useState(true);
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const designs = history.filter(h => h.type === 'prompt' && h.meta?.kind === 'image');

  const useTemplate = (cat: string) => {
    setCategory(cat);
    setPrompt(TEMPLATE_STARTERS[cat]);
    setTab('prompt');
  };

  const buildFullPrompt = () => {
    let p = prompt;
    p += `. ${style} style, clean commercial marketing design, bold text space, no watermark.`;
    if (matchBrandColors) p += ` Use a color palette fitting ${brand.businessName || 'a modern MSME brand'}.`;
    return p;
  };

  const handleGenerate = async () => {
    if (!prompt) return;
    setLoading(true);
    setImage(null);
    setSaved(false);
    try {
      const result = await generateImageAsset(brand, buildFullPrompt(), format.ratio);
      if (result) {
        setImage(`data:${result.mimeType};base64,${result.imageBytes}`);
      } else {
        alert("Couldn't generate an image this time. Try adjusting your prompt.");
      }
    } catch (e) {
      alert("Image generation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUseInPost = () => {
    if (!image) return;
    onSave({ type: 'prompt', content: image, status: 'draft', meta: { kind: 'image', prompt, style, category } });
    setSaved(true);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h2 className="text-3xl font-black text-ink tracking-tighter">Image Designer</h2>
        <p className="text-sm font-medium text-ink">Turn your ideas into beautiful visuals with AI.</p>
      </div>

      <div className="flex bg-slate-100 p-2 rounded-xl w-full sm:w-fit">
        {(['templates', 'prompt', 'designs'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 sm:flex-none px-6 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${tab === t ? 'bg-white text-primary shadow-md' : 'text-subtle hover:text-muted'}`}
          >
            {t === 'templates' ? 'Templates' : t === 'prompt' ? 'AI Prompt' : 'My Designs'}
          </button>
        ))}
      </div>

      {tab === 'templates' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => useTemplate(cat)}
              className="aspect-square rounded-xl border border-slate-200 bg-white hover:border-primary-300 hover:bg-slate-50 transition-colors flex flex-col items-center justify-center gap-2.5 p-4"
            >
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-primary flex items-center justify-center">
                <PaletteIcon className="w-5 h-5" />
              </div>
              <span className="font-black text-ink text-sm text-center">{cat}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'prompt' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-5 card-glass rounded-card p-6 md:p-9">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Describe your image</label>
              <textarea
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 min-h-[110px] resize-none outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-100 transition-all text-ink font-bold placeholder:text-subtle"
                placeholder='e.g. "Create a professional LinkedIn post graphic for an AI workshop for MSMEs"'
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Style</label>
              <div className="flex flex-wrap gap-2">
                {STYLES.map(s => (
                  <button key={s} onClick={() => setStyle(s)} className={`px-4 py-2 rounded-full text-xs font-black transition-all ${style === s ? 'bg-primary text-white ' : 'bg-slate-100 text-muted hover:bg-slate-200'}`}>{s}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Format</label>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map(f => (
                  <button key={f.label} onClick={() => setFormat(f)} className={`px-4 py-2 rounded-full text-xs font-black transition-all ${format.label === f.label ? 'bg-primary text-white ' : 'bg-slate-100 text-muted hover:bg-slate-200'}`}>{f.label}</button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={matchBrandColors} onChange={e => setMatchBrandColors(e.target.checked)} className="accent-[#003F8A] w-4 h-4" />
              <span className="text-sm font-bold text-ink">Match {brand.businessName ? `${brand.businessName}'s` : 'your'} brand colors</span>
            </label>

            <button
              onClick={handleGenerate}
              disabled={loading || !prompt}
              className="w-full bg-primary-gradient text-white shadow-btn hover:shadow-btn-hover hover:-translate-y-0.5 py-4 rounded-btn font-black disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Generating Image...</span>
                </>
              ) : (
                'Generate Image'
              )}
            </button>
          </div>

          <div className="card-glass rounded-card p-6 md:p-9">
            <span className="text-[10px] font-black text-subtle uppercase tracking-widest">Result</span>
            <div className="mt-4 bg-slate-900 rounded-xl overflow-hidden min-h-[300px] flex items-center justify-center">
              {loading ? (
                <div className="text-center space-y-4 py-16">
                  <div className="w-10 h-10 border-3 border-blue-400/20 border-t-blue-400 rounded-full animate-spin mx-auto"></div>
                  <p className="text-subtle font-medium italic text-sm">Designing your visual...</p>
                </div>
              ) : image ? (
                <img src={image} alt="Generated design" className="w-full h-full object-contain" />
              ) : (
                <p className="text-muted font-medium italic text-sm py-16">Your generated image will appear here</p>
              )}
            </div>
            {image && !loading && (
              <div className="flex gap-3 mt-4">
                <button onClick={() => setImage(null)} className="flex-1 py-3 rounded-btn font-black text-sm text-muted bg-white/60 backdrop-blur-sm border border-slate-200 hover:border-primary hover:text-primary hover:-translate-y-0.5 transition-all">Edit</button>
                <button onClick={handleGenerate} className="flex-1 py-3 rounded-xl font-black text-sm text-primary bg-primary-50 hover:bg-primary-100 transition-all">Regenerate</button>
                <button onClick={handleUseInPost} className="flex-1 py-3 rounded-btn font-black text-sm text-white bg-primary-gradient shadow-btn hover:shadow-btn-hover hover:-translate-y-0.5 transition-all">
                  {saved ? 'Saved ✓' : 'Save Design'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'designs' && (
        designs.length === 0 ? (
          <div className="text-center py-24 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <PaletteIcon className="w-8 h-8 text-subtle mx-auto mb-3" />
            <p className="text-subtle font-bold italic">No saved designs yet. Generate one in the AI Prompt tab.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {designs.map(d => (
              <div key={d.id} className="rounded-xl overflow-hidden border border-slate-200 bg-white group relative">
                <img src={d.content} alt={d.meta?.prompt || 'Design'} className="w-full aspect-square object-cover" />
                <div className="p-3">
                  <p className="text-xs font-bold text-ink truncate">{d.meta?.prompt || 'Untitled design'}</p>
                </div>
                <button
                  onClick={() => { if (confirm('Delete this design?')) onDelete(d.id); }}
                  className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full text-subtle hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Delete"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};

export default ImagePromptGenerator;
