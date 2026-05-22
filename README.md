# FlowState

Probability-first trading decision cockpit.

## Environment variables

Set these in Vercel:

```env
VITE_SUPABASE_URL=https://mauckkqddndphlihnbtt.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_public_key
```

Do not put your Twelve Data key in Vercel. It stays in Supabase Edge Function secrets.

## Local setup

```bash
npm install
npm run dev
```

## Vercel setup

Framework preset: Vite  
Build command: `npm run build`  
Output directory: `dist`  
Install command: `npm install`
