
import React, { useMemo, useState } from 'react';
import { generateBroadcast } from '../geminiService';
import { BrandContext, Contact, ContentStatus } from '../types';
import { TrashIcon, CheckCircleIcon } from './Icons';
import Stepper from './Stepper';

interface Props {
  brand: BrandContext;
  onSave: (item: any) => void;
  contacts: Contact[];
  onAddContact: (contact: Omit<Contact, 'id'>) => Promise<Contact>;
  onDeleteContact: (id: string) => void;
}

type AudienceMode = 'all' | 'industry' | 'location' | 'selected' | 'custom';
const STEPS = ['Compose', 'Audience', 'Review & Send'];
const CTAS = ['Shop Now', 'Contact Us', 'Learn More', 'Register Now'];

const BroadcastHelper: React.FC<Props> = ({ brand, onSave, contacts, onAddContact, onDeleteContact }) => {
  const [step, setStep] = useState(0);

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [cta, setCta] = useState(CTAS[0]);
  const [drafting, setDrafting] = useState(false);

  const [audienceMode, setAudienceMode] = useState<AudienceMode>('all');
  const [industry, setIndustry] = useState('');
  const [location, setLocation] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customList, setCustomList] = useState('');
  const [sendMode, setSendMode] = useState<'now' | 'later'>('now');
  const [sendDate, setSendDate] = useState('');

  const [newContact, setNewContact] = useState({ name: '', phone: '', industry: '', location: '' });
  const [showAddContact, setShowAddContact] = useState(false);

  const [savedStatus, setSavedStatus] = useState<ContentStatus | null>(null);

  const industries = useMemo(() => Array.from(new Set(contacts.map(c => c.industry).filter(Boolean))) as string[], [contacts]);
  const locations = useMemo(() => Array.from(new Set(contacts.map(c => c.location).filter(Boolean))) as string[], [contacts]);

  const audienceCount = useMemo(() => {
    switch (audienceMode) {
      case 'all': return contacts.length;
      case 'industry': return contacts.filter(c => c.industry === industry).length;
      case 'location': return contacts.filter(c => c.location === location).length;
      case 'selected': return selectedIds.length;
      case 'custom': return customList.split('\n').map(l => l.trim()).filter(Boolean).length;
      default: return 0;
    }
  }, [audienceMode, industry, location, selectedIds, customList, contacts]);

  const handleDraftWithAI = async () => {
    setDrafting(true);
    try {
      const output = await generateBroadcast(brand);
      setMessage(output);
    } catch (e) {
      alert("Couldn't draft a message. Try writing one manually.");
    } finally {
      setDrafting(false);
    }
  };

  const handleAddContact = async () => {
    if (!newContact.name.trim()) return;
    await onAddContact({
      name: newContact.name.trim(),
      phone: newContact.phone.trim() || undefined,
      industry: newContact.industry.trim() || undefined,
      location: newContact.location.trim() || undefined
    });
    setNewContact({ name: '', phone: '', industry: '', location: '' });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const fullMessage = `${subject ? subject + '\n\n' : ''}${message}${link ? `\n\n${link}` : ''}${cta ? `\n\n${cta}` : ''}`;

  const audienceLabel = audienceMode === 'all' ? 'All Members'
    : audienceMode === 'industry' ? `Industry: ${industry || '—'}`
    : audienceMode === 'location' ? `Location: ${location || '—'}`
    : audienceMode === 'selected' ? 'Selected Contacts'
    : 'Custom List';

  const handleSend = () => {
    const scheduledAt = sendMode === 'later' && sendDate ? new Date(sendDate).getTime() : undefined;
    const status: ContentStatus = sendMode === 'later' ? 'scheduled' : 'published';
    onSave({
      type: 'broadcast',
      content: fullMessage,
      status,
      scheduledAt,
      meta: { subject, audienceMode, audienceLabel, audienceCount, cta, link }
    });
    setSavedStatus(status);
  };

  const startOver = () => {
    setStep(0);
    setSubject('');
    setMessage('');
    setLink('');
    setSelectedIds([]);
    setCustomList('');
    setSavedStatus(null);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h2 className="text-3xl font-black text-ink tracking-tighter">Broadcast Message</h2>
        <p className="text-sm font-medium text-ink">Send mass messages to your audience with targeted filters.</p>
      </div>

      <Stepper steps={STEPS} current={step} />

      {step === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
          <div className="space-y-5 card-glass rounded-card p-6 md:p-9">
            <span className="text-[10px] font-black text-subtle uppercase tracking-widest">Message Content</span>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Subject</label>
              <input
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-100 transition-all text-ink font-bold placeholder:text-subtle"
                placeholder="e.g. Important Update from MCCIA"
                value={subject}
                onChange={e => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Message*</label>
                <button onClick={handleDraftWithAI} disabled={drafting} className="text-[10px] font-black text-primary hover:underline disabled:opacity-50">
                  {drafting ? 'Drafting...' : 'Draft with AI'}
                </button>
              </div>
              <textarea
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 min-h-[120px] resize-none outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-100 transition-all text-ink font-bold placeholder:text-subtle"
                placeholder="Dear Members, we are excited to share..."
                value={message}
                onChange={e => setMessage(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Add Link (optional)</label>
              <input
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-100 transition-all text-ink font-bold placeholder:text-subtle"
                placeholder="https://..."
                value={link}
                onChange={e => setLink(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-subtle uppercase tracking-widest">Call to Action</label>
              <div className="flex flex-wrap gap-2">
                {CTAS.map(c => (
                  <button key={c} onClick={() => setCta(c)} className={`px-4 py-2 rounded-full text-xs font-black transition-all ${cta === c ? 'bg-primary text-white ' : 'bg-slate-100 text-muted hover:bg-slate-200'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card-glass rounded-card p-6 md:p-9">
            <span className="text-[10px] font-black text-subtle uppercase tracking-widest">Preview</span>
            <div className="mt-4 bg-primary-50 p-5 rounded-xl border border-primary-150 min-h-[220px]">
              {subject && <p className="font-black text-ink mb-2">{subject}</p>}
              <p className="text-sm text-ink font-medium whitespace-pre-wrap">{message || 'Your message will appear here'}</p>
              {link && <p className="text-xs text-primary font-bold mt-3 break-all">{link}</p>}
              {cta && <span className="inline-block mt-3 px-4 py-2 rounded-full bg-primary text-white text-xs font-black">{cta}</span>}
            </div>
          </div>

          <div className="lg:col-span-2">
            <button onClick={() => setStep(1)} disabled={!message} className="w-full sm:w-auto sm:min-w-[240px] bg-primary-gradient text-white shadow-btn hover:shadow-btn-hover hover:-translate-y-0.5 py-4 px-8 rounded-btn font-black disabled:opacity-50 active:scale-95 transition-all">
              Next
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl items-start">
          <div className="space-y-4 card-glass rounded-card p-6 md:p-9">
            <span className="text-[10px] font-black text-subtle uppercase tracking-widest">Send To</span>
            <div className="space-y-2">
              {([
                { mode: 'all' as const, label: 'All Members' },
                { mode: 'industry' as const, label: 'Specific Industry' },
                { mode: 'location' as const, label: 'Specific Location' },
                { mode: 'selected' as const, label: 'Selected Contacts' },
                { mode: 'custom' as const, label: 'Custom List' }
              ]).map(opt => (
                <label key={opt.mode} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${audienceMode === opt.mode ? 'border-primary bg-primary-50' : 'border-slate-200 hover:border-slate-200'}`}>
                  <input type="radio" checked={audienceMode === opt.mode} onChange={() => setAudienceMode(opt.mode)} className="accent-[#003F8A]" />
                  <span className="font-bold text-sm text-ink">{opt.label}</span>
                </label>
              ))}
            </div>

            {audienceMode === 'industry' && (
              <select value={industry} onChange={e => setIndustry(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-ink font-bold outline-none focus:border-primary">
                <option value="">Select industry...</option>
                {industries.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            )}
            {audienceMode === 'location' && (
              <select value={location} onChange={e => setLocation(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-ink font-bold outline-none focus:border-primary">
                <option value="">Select location...</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            )}
            {audienceMode === 'selected' && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {contacts.length === 0 ? (
                  <p className="text-xs text-subtle italic">No contacts yet - add some below.</p>
                ) : contacts.map(c => (
                  <label key={c.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50">
                    <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleSelected(c.id)} className="accent-[#003F8A]" />
                    <span className="text-sm font-bold text-ink">{c.name}</span>
                  </label>
                ))}
              </div>
            )}
            {audienceMode === 'custom' && (
              <textarea
                value={customList}
                onChange={e => setCustomList(e.target.value)}
                placeholder={"One contact per line\ne.g.\nRamesh - 9876543210\nSita - 9876500000"}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 min-h-[100px] text-ink font-medium text-sm outline-none focus:border-primary"
              />
            )}

            <div className="pt-3 border-t border-slate-200 space-y-3">
              <span className="text-[10px] font-black text-subtle uppercase tracking-widest">Schedule</span>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setSendMode('now')} className={`p-3 rounded-xl border-2 font-black text-sm transition-all ${sendMode === 'now' ? 'border-primary bg-primary-50 text-primary' : 'border-slate-200 text-muted'}`}>Send Now</button>
                <button onClick={() => setSendMode('later')} className={`p-3 rounded-xl border-2 font-black text-sm transition-all ${sendMode === 'later' ? 'border-primary bg-primary-50 text-primary' : 'border-slate-200 text-muted'}`}>Schedule Later</button>
              </div>
              {sendMode === 'later' && (
                <input type="datetime-local" value={sendDate} onChange={e => setSendDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-ink font-bold outline-none focus:border-primary" />
              )}
            </div>

            <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-between">
              <span className="text-xs font-black text-subtle uppercase tracking-widest">Estimated Audience</span>
              <span className="text-xl font-black text-primary">{audienceCount.toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-4 card-glass rounded-card p-6 md:p-9">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-subtle uppercase tracking-widest">Contacts ({contacts.length})</span>
              <button onClick={() => setShowAddContact(v => !v)} className="text-xs font-black text-primary hover:underline">{showAddContact ? 'Close' : '+ Add Contact'}</button>
            </div>

            {showAddContact && (
              <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <input className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-ink outline-none focus:border-primary" placeholder="Name*" value={newContact.name} onChange={e => setNewContact({ ...newContact, name: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <input className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-ink outline-none focus:border-primary" placeholder="Phone" value={newContact.phone} onChange={e => setNewContact({ ...newContact, phone: e.target.value })} />
                  <input className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-ink outline-none focus:border-primary" placeholder="Industry" value={newContact.industry} onChange={e => setNewContact({ ...newContact, industry: e.target.value })} />
                </div>
                <input className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-ink outline-none focus:border-primary" placeholder="Location" value={newContact.location} onChange={e => setNewContact({ ...newContact, location: e.target.value })} />
                <button onClick={handleAddContact} disabled={!newContact.name.trim()} className="w-full bg-primary text-white py-2.5 rounded-xl font-black text-sm disabled:opacity-50">Save Contact</button>
              </div>
            )}

            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {contacts.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <p className="text-subtle font-bold italic text-sm">No contacts yet. Add your first one above.</p>
                </div>
              ) : contacts.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                  <div>
                    <p className="text-sm font-bold text-ink">{c.name}</p>
                    <p className="text-[10px] text-subtle font-bold uppercase tracking-wide">{[c.industry, c.location, c.phone].filter(Boolean).join(' · ') || 'No details'}</p>
                  </div>
                  <button onClick={() => onDeleteContact(c.id)} className="text-subtle hover:text-red-500 transition-colors">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 flex gap-3">
            <button onClick={() => setStep(0)} className="flex-1 py-4 rounded-btn font-black text-muted bg-white/60 backdrop-blur-sm border border-slate-200 hover:border-primary hover:text-primary hover:-translate-y-0.5 transition-all">Back</button>
            <button onClick={() => setStep(2)} className="flex-1 py-4 rounded-btn font-black text-white bg-primary-gradient shadow-btn hover:shadow-btn-hover hover:-translate-y-0.5 transition-all">Next</button>
          </div>
        </div>
      )}

      {step === 2 && (
        savedStatus ? (
          <div className="card-glass rounded-card p-6 md:p-9 text-center py-10 space-y-4 max-w-2xl">
            <CheckCircleIcon className="w-10 h-10 text-green-600 mx-auto" />
            <p className="font-black text-ink text-lg">
              {savedStatus === 'scheduled' ? 'Broadcast scheduled' : 'Broadcast sent'}
            </p>
            <button onClick={startOver} className="text-primary font-black text-sm underline">Create another broadcast</button>
          </div>
        ) : (
          <div className="space-y-6 max-w-2xl">
            <div className="card-glass rounded-card p-6 md:p-9 space-y-4">
              <span className="text-[10px] font-black text-subtle uppercase tracking-widest">Preview Message</span>
              <div className="bg-primary-50 p-5 rounded-xl border border-primary-150 relative">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink font-medium">{fullMessage}</p>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-subtle">Audience</span>
                <span className="font-black text-ink">{audienceLabel} · {audienceCount.toLocaleString()} recipients</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-subtle">Timing</span>
                <span className="font-black text-ink">{sendMode === 'now' ? 'Send immediately' : `Scheduled: ${sendDate || 'not set'}`}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 py-4 rounded-btn font-black text-muted bg-white/60 backdrop-blur-sm border border-slate-200 hover:border-primary hover:text-primary hover:-translate-y-0.5 transition-all">Back</button>
              <button onClick={handleSend} className="flex-1 py-4 rounded-btn font-black text-white bg-primary-gradient shadow-btn hover:shadow-btn-hover hover:-translate-y-0.5 transition-all">
                {sendMode === 'now' ? 'Send Broadcast' : 'Schedule Broadcast'}
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default BroadcastHelper;
