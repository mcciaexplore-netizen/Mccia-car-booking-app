import React from 'react';
import { View } from '../types';
import { SparkleIcon, TagIcon, MessageIcon, MegaphoneIcon, PaletteIcon, CalendarIcon } from './Icons';

export interface ToolDef {
  view: View;
  title: string;
  desc: string;
  icon: React.FC<{ className?: string }>;
}

export const TOOLS: ToolDef[] = [
  {
    view: 'post',
    title: "Today's Post",
    desc: 'Caption + Matching Visual Prompt',
    icon: SparkleIcon
  },
  {
    view: 'offer',
    title: 'Offer Post',
    desc: 'Promote a product or seasonal discount',
    icon: TagIcon
  },
  {
    view: 'reply',
    title: 'Reply Assistant',
    desc: 'Professional replies to customer queries',
    icon: MessageIcon
  },
  {
    view: 'broadcast',
    title: 'Broadcast Message',
    desc: 'Engagement-focused mass messages',
    icon: MegaphoneIcon
  },
  {
    view: 'prompt',
    title: 'Image Designer',
    desc: 'Structured prompts for visual ideas',
    icon: PaletteIcon
  },
  {
    view: 'planner',
    title: 'Monthly Planner',
    desc: 'Generate a 30-day content outline',
    icon: CalendarIcon
  }
];
