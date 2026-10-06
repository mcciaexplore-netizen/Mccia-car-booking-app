
import React, { useState } from 'react';
import { BrandContext } from '../types';

interface Props {
  onSave: (brand: BrandContext) => void;
}

type StepField = keyof Pick<BrandContext, 'businessName' | 'apiKey' | 'ownerName' | 'category' | 'city' | 'language' | 'tone' | 'businessDescription'>;

interface StepDef {
  field: StepField;
  kind: 'text' | 'password' | 'select' | 'textarea';
  title: string;
  subtitle?: string;
  placeholder?: string;
  autoComplete?: string;
  options?: string[];
}

const STEPS: StepDef[] = [
  {
    field: 'businessName',
    kind: 'text',
    title: "What's your business called?",
    subtitle: "This is how you'll be introduced across every post.",
    placeholder: 'e.g. Ramesh Hardware Store',
    autoComplete: 'organization'
  },
  {
    field: 'apiKey',
    kind: 'password',
    title: 'Add your Gemini API key',
    subtitle: 'Stays only on this device. Skip it later if you\'d rather use a shared key.',
    placeholder: 'Paste your Gemini API key here...'
  },
  {
    field: 'ownerName',
    kind: 'text',
    title: "What's your name?",
    subtitle: "We'll show this on your profile.",
    placeholder: 'e.g. Ramesh Gupta',
    autoComplete: 'name'
  },
  {
    field: 'category',
    kind: 'text',
    title: 'What category is your business?',
    placeholder: 'e.g. Retail'
  },
  {
    field: 'city',
    kind: 'text',
    title: 'Which city are you based in?',
    placeholder: 'e.g. Pune',
    autoComplete: 'address-level2'
  },
  {
    field: 'language',
    kind: 'select',
    title: 'Which language should we write in?',
    options: ['English', 'Hinglish', 'Hindi']
  },
  {
    field: 'tone',
    kind: 'select',
    title: 'What tone fits your brand?',
    options: ['Friendly', 'Professional', 'Local']
  },
  {
    field: 'businessDescription',
    kind: 'textarea',
    title: 'What products or services do you offer?',
    subtitle: 'Optional, but it helps us write more specific content.',
    placeholder: 'e.g. Hardware, tools and paints for local homes and shops'
  }
];

const DEFAULTS: BrandContext = {
  businessName: '',
  ownerName: '',
  category: '',
  city: '',
  language: 'English',
  tone: 'Friendly',
  businessDescription: '',
  apiKey: ''
};

const OnboardingWizard: React.FC<Props> = ({ onSave }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [formData, setFormData] = useState<BrandContext>(DEFAULTS);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const value = formData[step.field] || '';

  const setValue = (v: string) => setFormData(prev => ({ ...prev, [step.field]: v }));

  const goNext = () => {
    if (isLast) {
      onSave(formData);
    } else {
      setStepIndex(i => i + 1);
    }
  };

  const goBack = () => {
    if (stepIndex > 0) setStepIndex(i => i - 1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && step.kind !== 'textarea') {
      e.preventDefault();
      goNext();
    }
  };

  return (
    <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-10">
          <button
            onClick={goBack}
            disabled={stepIndex === 0}
            className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-all disabled:opacity-0 disabled:pointer-events-none"
            aria-label="Back"
          >
            <svg className="w-5 h-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <img src="/mccia-logo.png" alt="MCCIA" className="h-7 w-auto" />
          <span className="text-[10px] font-black text-subtle uppercase tracking-widest w-10 text-right">
            {stepIndex + 1}/{STEPS.length}
          </span>
        </div>

        <div className="w-full h-1 bg-slate-100 rounded-full mb-10 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div key={stepIndex} className="animate-slide-up">
          <h2 className="text-2xl sm:text-3xl font-black text-ink tracking-tight text-center">{step.title}</h2>
          {step.subtitle && (
            <p className="text-ink font-medium text-center mt-3 leading-relaxed">{step.subtitle}</p>
          )}

          <div className="mt-8">
            {step.kind === 'select' ? (
              <select
                autoFocus
                value={value}
                onChange={e => setValue(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-100 transition-all text-ink font-bold text-lg text-center"
              >
                {step.options!.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : step.kind === 'textarea' ? (
              <textarea
                autoFocus
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={step.placeholder}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 min-h-[120px] resize-none outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-100 transition-all text-ink font-bold placeholder:text-subtle placeholder:font-medium"
              />
            ) : (
              <input
                autoFocus
                type={step.kind === 'password' ? 'password' : 'text'}
                autoComplete={step.autoComplete}
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={step.placeholder}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 outline-none focus:border-primary focus:ring-[3px] focus:ring-primary-100 transition-all text-ink font-bold text-lg text-center placeholder:text-subtle placeholder:font-medium"
              />
            )}

            {step.field === 'apiKey' && (
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="block text-center text-xs font-bold text-primary hover:text-primary underline mt-3"
              >
                Get a free API key from Google AI Studio
              </a>
            )}
          </div>

          <div className="mt-10 space-y-3">
            <button
              onClick={goNext}
              className="w-full bg-primary-gradient text-white shadow-btn hover:shadow-btn-hover hover:-translate-y-0.5 py-4 rounded-btn font-black text-lg active:scale-95 hover:-translate-y-0.5 transition-all"
            >
              {isLast ? 'Get Started' : 'Continue'}
            </button>
            {!isLast && (
              <button
                onClick={goNext}
                className="w-full text-subtle font-bold text-xs uppercase tracking-widest py-2 hover:text-muted transition-colors"
              >
                Skip for now
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
