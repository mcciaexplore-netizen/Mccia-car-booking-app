
import { GoogleGenAI, Type } from "@google/genai";
import { BrandContext, HistoryItem, MonthlyPlanItem } from "./types";

/**
 * This service uses the API key from the brand context if available, otherwise falls back to process.env.API_KEY.
 */

const getSystemInstruction = (brand: BrandContext) => `
You are a social media and WhatsApp assistant for an Indian MSME.
Business Name: ${brand.businessName}
Category: ${brand.category}
Location: ${brand.city}
${brand.businessDescription ? `Business Description: ${brand.businessDescription}` : ''}
Preferred Language: ${brand.language}
Tone: ${brand.tone}

Rules:
1. Always respond in ${brand.language}. If Hinglish, use Latin script but Hindi vocabulary.
2. Keep it short and task-focused.
3. Use ${brand.tone} tone.
4. Avoid excessive emojis. 
5. Content must be ready to copy-paste.
6. Use the business description to make content specific to their services.
7. For post generation, include emojis sparingly to keep it professional.
`;

const getAI = (userKey?: string) => {
  const key = userKey || process.env.API_KEY;
  if (!key) {
    throw new Error("API Key is missing. Please add your Gemini API Key in the settings.");
  }
  return new GoogleGenAI({ apiKey: key });
};

export interface GeneratedPost {
  headline: string;
  caption: string;
  hashtags: string[];
  cta: string;
}

export const generateTodayPost = async (
  brand: BrandContext,
  history: HistoryItem[],
  objective?: string,
  platform?: string,
  brief?: string,
  postTone?: string
): Promise<GeneratedPost> => {
  const ai = getAI(brand.apiKey);
  const previousThemes = history.slice(0, 5).map(h => h.content).join("\n");

  const prompt = `Create a social media post.
  ${objective ? `Objective: ${objective}` : ''}
  ${platform ? `Target platform: ${platform}` : ''}
  ${postTone ? `Tone for this specific post: ${postTone}` : ''}
  ${brief ? `What the post should be about: ${brief}` : 'Pick a relevant topic for today.'}
  Recent posts to avoid repeating: ${previousThemes}
  Keep the caption under 100 words.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      systemInstruction: getSystemInstruction(brand),
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING },
          caption: { type: Type.STRING },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
          cta: { type: Type.STRING }
        },
        required: ["headline", "caption", "hashtags", "cta"]
      }
    }
  });
  const text = response.text || "{}";
  try {
    return JSON.parse(text);
  } catch (e) {
    return { headline: '', caption: text, hashtags: [], cta: '' };
  }
};

export const generateImagePromptForPost = async (brand: BrandContext, postContent: string) => {
  const ai = getAI(brand.apiKey);
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Based on: "${postContent}", generate a structured image prompt JSON.`,
    config: {
      systemInstruction: getSystemInstruction(brand),
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING },
          image_type: { type: Type.STRING },
          subject: { type: Type.STRING },
          setting: { type: Type.STRING },
          style: { type: Type.STRING },
          text_on_image: { type: Type.STRING },
          aspect_ratio: { type: Type.STRING }
        },
        required: ["platform", "image_type", "subject", "setting", "style", "text_on_image", "aspect_ratio"]
      }
    }
  });
  const text = response.text || "{}";
  try {
    return JSON.parse(text);
  } catch (e) {
    return {};
  }
};

export interface OfferInput {
  productName: string;
  offerTitle?: string;
  discount?: string;
  description?: string;
  validUntil?: string;
  targetAudience?: string;
  cta?: string;
}

export interface GeneratedOffer {
  caption: string;
  hashtags: string[];
}

export const generateOffer = async (brand: BrandContext, input: OfferInput): Promise<GeneratedOffer> => {
  const ai = getAI(brand.apiKey);
  const prompt = `Create a promotional offer post for "${input.productName}".
  ${input.offerTitle ? `Offer title: ${input.offerTitle}` : ''}
  ${input.discount ? `Discount: ${input.discount}` : ''}
  ${input.description ? `Details: ${input.description}` : ''}
  ${input.validUntil ? `Valid until: ${input.validUntil}` : ''}
  ${input.targetAudience ? `Target audience: ${input.targetAudience}` : ''}
  ${input.cta ? `Call to action: ${input.cta}` : ''}
  Write one caption that works for both WhatsApp and Instagram.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      systemInstruction: getSystemInstruction(brand),
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          caption: { type: Type.STRING },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["caption", "hashtags"]
      }
    }
  });
  const text = response.text || "{}";
  try {
    return JSON.parse(text);
  } catch (e) {
    return { caption: text, hashtags: [] };
  }
};

export const generateReply = async (brand: BrandContext, customerMessage: string) => {
  const ai = getAI(brand.apiKey);
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Reply to: "${customerMessage}". Focus on helpful intent.`,
    config: { systemInstruction: getSystemInstruction(brand) }
  });
  return response.text || "";
};

export interface ReplyVariant {
  style: string;
  text: string;
}

export const generateReplyVariants = async (
  brand: BrandContext,
  customerMessage: string,
  context?: string
): Promise<ReplyVariant[]> => {
  const ai = getAI(brand.apiKey);
  const prompt = `A customer sent this message: "${customerMessage}"
  ${context ? `Extra context about the product/event/company to reference: ${context}` : ''}
  Write 4 different reply variants: one Professional, one Friendly, one Short (1-2 lines), one Detailed.
  Each must fully address the customer's message using the extra context where relevant.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      systemInstruction: getSystemInstruction(brand),
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            style: { type: Type.STRING },
            text: { type: Type.STRING }
          },
          required: ["style", "text"]
        }
      }
    }
  });
  const text = response.text || "[]";
  try {
    return JSON.parse(text);
  } catch (e) {
    return [];
  }
};

export const generateBroadcast = async (brand: BrandContext) => {
  const ai = getAI(brand.apiKey);
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Short WhatsApp broadcast message for today. Non-spammy.`,
    config: { systemInstruction: getSystemInstruction(brand) }
  });
  return response.text || "";
};

export const generateImagePrompt = async (brand: BrandContext, topic: string) => {
  const ai = getAI(brand.apiKey);
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Generate an image prompt for: ${topic}. Format as JSON.`,
    config: {
      systemInstruction: getSystemInstruction(brand),
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING },
          image_type: { type: Type.STRING },
          subject: { type: Type.STRING },
          setting: { type: Type.STRING },
          style: { type: Type.STRING },
          text_on_image: { type: Type.STRING },
          aspect_ratio: { type: Type.STRING }
        }
      }
    }
  });
  const text = response.text || "{}";
  try {
    return JSON.parse(text);
  } catch (e) {
    return {};
  }
};

export const generateMonthlyPlan = async (brand: BrandContext): Promise<MonthlyPlanItem[]> => {
  const ai = getAI(brand.apiKey);
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: "30-day social media plan JSON.",
    config: {
      systemInstruction: getSystemInstruction(brand),
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            type: { type: Type.STRING },
            topic: { type: Type.STRING }
          },
          required: ["date", "type", "topic"]
        }
      }
    }
  });
  const text = response.text || "[]";
  try {
    return JSON.parse(text);
  } catch (e) {
    return [];
  }
};

export interface GeneratedImageAsset {
  imageBytes: string;
  mimeType: string;
}

/**
 * Generates an actual image (not just a prompt spec) via Imagen.
 * Returns null if the model returned no image (e.g. safety filter, quota).
 */
export const generateImageAsset = async (
  brand: BrandContext,
  prompt: string,
  aspectRatio: string = '1:1'
): Promise<GeneratedImageAsset | null> => {
  const ai = getAI(brand.apiKey);
  const response = await ai.models.generateImages({
    model: 'imagen-3.0-generate-002',
    prompt,
    config: {
      numberOfImages: 1,
      aspectRatio
    }
  });
  const image = response.generatedImages?.[0]?.image;
  if (!image?.imageBytes) return null;
  return { imageBytes: image.imageBytes, mimeType: image.mimeType || 'image/png' };
};
