<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1IcRUAi6Uw1yPS4ZG0_2T6vuHsR4HLP5C

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and set `GEMINI_API_KEY` to your Gemini API key (Firebase vars are optional - see the comments in that file)
3. Run the app:
   `npm run dev`

## Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel (framework preset: Vite - auto-detected, no extra config needed)
2. In the Vercel project's Environment Variables settings, add `GEMINI_API_KEY` (required), and optionally the `VITE_FIREBASE_*` variables from [.env.example](.env.example) for cloud sync
3. Deploy - Vercel runs `npm run build` and serves the `dist` output automatically
