
import React, { useState } from 'react';
import { generateOffer, generateImageAsset, GeneratedOffer } from '../geminiService';
import { BrandContext, ContentStatus } from '../types';
import { CopyIcon, CheckCircleIcon } from './Icons';
import Stepper from './Stepper';
import ScheduleStep from './ScheduleStep';

interface Props {
  brand: BrandContext;
  onSave: (item: any) => void;
}

const STEPS = ['Create Offer', 'Design', 'Preview'];
const CTAS = ['Shop Now', 'Contact Us', 'Learn More'];

const TEMPLATES = [
  { id: 'Modern', gradient: 'from-slate-700 to-slate-900' },
  { id: 'Premium', gradient: 'from-amber-600 to-yellow-900' },
  { id: 'Festival', gradient: 'from-orange-500 to-red-600' },
  { id: 'Sale', gradient: 'from-red-500 to-pink-600' },
  { id: 'Minimal', gradient: 'from-slate-100 to-slate-200' }
];

const BRAND_COLORS = ['#2563eb', '#7c3aed', '#059669', '#ea580c', '#db2777'];

const OfferGenerator: React.FC<Props> = ({ brand, onSave }) => {
  const [step, setStep] = useState(0);

  const [productName, setProductName] = useState('');
  const [offerTitle, setOfferTitle] = useState('');
  const [discount, setDiscount] = useState('');
  const [description, setDescription] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [cta, setCta] = useState(CTAS[0]);

  const [template, setTemplate] = useState(TEMPLATES[0].id);
  const [accentColor, setAccentColor] = useState(BRAND_COLORS[0]);
  const [visualLoading, setVisualLoading] = useState(false);
  const [visualImage, setVisualImage] = useState<string | null>(null);

  const [offer, setOffer] = useState<GeneratedOffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedStatus, setSavedStatus] = useState<ContentStatus | null>(null);

  const activeTemplate = TEMPLATES.find(t => t.id === template)!;

  const handleGenerateVisual = async () => {
    setVisualLoading(true);
    try {
      const prompt = `${template} style promotional graphic for "${offerTitle || productName}"${discount ? `, ${discount} off` : ''}. Clean commercial marketing design, bold text space, no watermark.`;
      const image = await generateImageAsset(brand, prompt, '1:1');
      if (image) {
        setVisualImage(`data:${image.mimeType};base64,${image.imageBytes}`);
      } else {
        alert("Couldn't generate a visual this time. You can still continue without one.");
      }
    } catch (e) {
      alert("Image generation failed. You can still continue without one.");
    } finally {
      setVisualLoading(false);
    }
  };

  const goToPreview = async () => {
    setStep(2);
    setLoading(true);
    try {
      const output = await generateOffer(brand, { productName, offerTitle, discount, description, validUntil, targetAudience, cta });
      setOffer(output);
    } catch (e) {
      alert("Error generating offer.");
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const regenerate = async () => {
    setLoading(true);
    try {
      const output = await generateOffer(brand, { productName, offerTitle, discount, description, validUntil, targetAudience, cta });
      setOffer(output);
    } catch (e) {
      alert("Error regenerating offer.");
    } finally {
      setLoading(false);
    }
  };

  const fullText = offer ? `${offer.caption}\n\n${offer.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}` : '';

  const handleConfirm = (status: ContentStatus, scheduledAt?: number) => {
    onSave({
      type: 'offer',
      content: fullText,
      status,
      scheduledAt,
      meta: { productName, offerTitle, discount, validUntil, targetAudience, cta, template, accentColor }
    });
    setSavedStatus(status);
  };

  const startOver = () => {
    setStep(0);
    setOffer(null);
    setVisualImage(null);
    setSavedStatus(null);
    setProductName('');
    setOfferTitle('');
    setDiscount('');
    setDescription('');
    setValidUntil('');
    setTargetAudience('');
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h2 className="text-3xl font-black text-ink tracking-tighter">Offer Post</h2>
        <p className="text-sm font-medium text-ink">Showcase your offers, discounts or new products.</p>
      </div>

      <Stepper steps={STEPS} current={step} />

      {step === 0 && (
        <div className="space-y-5 card-glass rounded-card p-6 md:p-9 max-w-2xl">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Product / Service Name*</label>
            <input
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-100 transition-all text-ink font-bold placeholder:text-subtle"
              placeholder="e.g. AI Workshop for MSMEs"
              value={productName}
              onChange={e => setProductName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Offer Title</label>
            <input
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-100 transition-all text-ink font-bold placeholder:text-subtle"
              placeholder="e.g. Special Discount for MCCIA Members"
              value={offerTitle}
              onChange={e => setOfferTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Discount</label>
              <input
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-100 transition-all text-ink font-bold placeholder:text-subtle"
                placeholder="e.g. 20% off"
                value={discount}
                onChange={e => setDiscount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Valid Until</label>
              <input
                type="date"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-100 transition-all text-ink font-bold"
                value={validUntil}
                onChange={e => setValidUntil(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Description</label>
            <textarea
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 min-h-[90px] resize-none outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-100 transition-all text-ink font-bold placeholder:text-subtle"
              placeholder="Get up to 20% off on all our latest products. Limited time offer."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Target Audience</label>
            <input
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-100 transition-all text-ink font-bold placeholder:text-subtle"
              placeholder="e.g. Existing customers in Pune"
              value={targetAudience}
              onChange={e => setTargetAudience(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Call to Action</label>
            <div className="flex flex-wrap gap-2">
              {CTAS.map(c => (
                <button
                  key={c}
                  onClick={() => setCta(c)}
                  className={`px-4 py-2 rounded-full text-xs font-black transition-all ${cta === c ? 'bg-primary text-white ' : 'bg-slate-100 text-muted hover:bg-slate-200'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setStep(1)}
            disabled={!productName}
            className="w-full bg-primary-gradient text-white shadow-btn hover:shadow-btn-hover hover:-translate-y-0.5 py-4 rounded-btn font-black disabled:opacity-50 active:scale-95 transition-all"
          >
            Next
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-6 card-glass rounded-card p-6 md:p-9">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Select Template</label>
              <div className="grid grid-cols-3 gap-3">
                {TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(t.id)}
                    className={`aspect-square rounded-xl bg-gradient-to-br ${t.gradient} relative flex items-end p-2 border-2 transition-all ${template === t.id ? 'border-primary scale-95' : 'border-transparent'}`}
                  >
                    <span className={`text-[9px] font-black uppercase ${t.id === 'Minimal' ? 'text-muted' : 'text-white'}`}>{t.id}</span>
                    {template === t.id && <span className="absolute top-1.5 right-1.5 text-primary text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Brand Color</label>
              <div className="flex gap-2">
                {BRAND_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setAccentColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-9 h-9 rounded-full border-4 transition-all ${accentColor === c ? 'border-slate-900' : 'border-white shadow'}`}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-subtle uppercase tracking-widest">AI-Generated Visual (optional)</label>
              <button
                onClick={handleGenerateVisual}
                disabled={visualLoading}
                className="w-full border-2 border-dashed border-slate-200 rounded-xl py-4 text-sm font-black text-muted hover:border-primary-300 hover:text-primary transition-all disabled:opacity-50"
              >
                {visualLoading ? 'Generating...' : visualImage ? 'Regenerate Visual' : 'Generate Visual with AI'}
              </button>
            </div>
          </div>

          <div className="card-glass rounded-card p-6 md:p-9">
            <span className="text-[10px] font-black text-subtle uppercase tracking-widest">Preview</span>
            <div className={`mt-4 rounded-xl overflow-hidden shadow-lg border border-slate-200 bg-gradient-to-br ${activeTemplate.gradient} aspect-square flex flex-col justify-between p-6 relative`}>
              {visualImage && <img src={visualImage} alt="Generated visual" className="absolute inset-0 w-full h-full object-cover opacity-90" />}
              <div className="relative z-10">
                <p className={`text-[10px] font-black uppercase tracking-widest ${template === 'Minimal' ? 'text-muted' : 'text-white/80'}`}>{brand.businessName}</p>
                <p className={`text-2xl font-black mt-2 ${template === 'Minimal' ? 'text-ink' : 'text-white'}`}>{offerTitle || productName || 'Your Offer'}</p>
                {discount && <p className={`font-black text-4xl mt-2 ${template === 'Minimal' ? 'text-ink' : 'text-white'}`}>{discount}</p>}
              </div>
              <div className="relative z-10">
                <span style={{ backgroundColor: accentColor }} className="inline-block px-4 py-2 rounded-full text-white text-xs font-black">{cta}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex gap-3 max-w-2xl">
          <button onClick={() => setStep(0)} className="flex-1 py-4 rounded-btn font-black text-muted bg-white/60 backdrop-blur-sm border border-slate-200 hover:border-primary hover:text-primary hover:-translate-y-0.5 transition-all">Back</button>
          <button onClick={goToPreview} className="flex-1 py-4 rounded-btn font-black text-white bg-primary-gradient shadow-btn hover:shadow-btn-hover hover:-translate-y-0.5 transition-all">Next</button>
        </div>
      )}

      {step === 2 && (
        savedStatus ? (
          <div className="card-glass rounded-card p-6 md:p-9 text-center py-10 space-y-4">
            <CheckCircleIcon className="w-10 h-10 text-green-600 mx-auto" />
            <p className="font-black text-ink text-lg">
              {savedStatus === 'draft' ? 'Saved as draft' : savedStatus === 'scheduled' ? 'Offer scheduled' : 'Marked as published'}
            </p>
            <button onClick={startOver} className="text-primary font-black text-sm underline">Create another offer</button>
          </div>
        ) : loading ? (
          <div className="card-glass rounded-card p-16 text-center space-y-4">
            <div className="w-10 h-10 border-3 border-primary-150 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
            <p className="text-subtle font-bold italic">Writing your offer post...</p>
          </div>
        ) : offer ? (
          <div className="space-y-6">
            <div className="card-glass rounded-card p-6 md:p-9 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-black text-subtle uppercase tracking-[0.2em]">Generated Content</span>
                <button onClick={() => { navigator.clipboard.writeText(fullText); alert('Copied!'); }} className="text-primary flex items-center gap-2 text-xs font-black bg-primary-50 px-4 py-2 rounded-full hover:bg-primary-100 transition-all active:scale-95">
                  <CopyIcon className="w-4 h-4" /> Copy All
                </button>
              </div>
              <div className="bg-slate-50 p-6 rounded-xl whitespace-pre-wrap text-base leading-relaxed text-ink font-bold border-l-4 border-primary shadow-inner">
                {fullText}
              </div>
            </div>
            <div className="flex gap-3 max-w-2xl">
              <button onClick={() => setStep(1)} className="flex-1 py-4 rounded-btn font-black text-muted bg-white/60 backdrop-blur-sm border border-slate-200 hover:border-primary hover:text-primary hover:-translate-y-0.5 transition-all">← Edit</button>
              <button onClick={regenerate} className="flex-1 py-4 rounded-lg font-black text-primary bg-primary-50 hover:bg-primary-100 transition-all">Regenerate</button>
            </div>
            <ScheduleStep onBack={() => setStep(1)} onConfirm={handleConfirm} confirmLabel="Publish" />
          </div>
        ) : null
      )}
    </div>
  );
};

export default OfferGenerator;
