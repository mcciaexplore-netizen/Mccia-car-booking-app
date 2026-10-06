
export type Language = 'English' | 'Hinglish' | 'Hindi';
export type Tone = 'Professional' | 'Friendly' | 'Local';

export type View =
  | 'dashboard'
  | 'tools'
  | 'content'
  | 'post'
  | 'offer'
  | 'reply'
  | 'broadcast'
  | 'prompt'
  | 'planner'
  | 'settings';

export interface BrandContext {
  businessName: string;
  ownerName?: string;
  category: string;
  city: string;
  language: Language;
  tone: Tone;
  businessDescription?: string;
  apiKey?: string;
  firebaseConfigJSON?: string;
}

export type ContentStatus = 'draft' | 'scheduled' | 'published';

export interface ContentMetrics {
  views?: number;
  likes?: number;
  comments?: number;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  type: 'post' | 'offer' | 'reply' | 'broadcast' | 'prompt';
  content: string;
  meta?: any;
  status?: ContentStatus;
  scheduledAt?: number;
  metrics?: ContentMetrics;
}

export interface Contact {
  id: string;
  name: string;
  phone?: string;
  industry?: string;
  location?: string;
}

export type PostObjective = 'Event Promotion' | 'Product/Service' | 'Educational' | 'Announcement' | 'Engagement';
export type Platform = 'LinkedIn' | 'Instagram' | 'Facebook';
export type AudienceMode = 'all' | 'industry' | 'location' | 'selected';

export interface ImagePrompt {
  platform: string;
  image_type: string;
  subject: string;
  setting: string;
  style: string;
  text_on_image: string;
  aspect_ratio: string;
}

export interface MonthlyPlanItem {
  date: string;
  type: string;
  topic: string;
}
