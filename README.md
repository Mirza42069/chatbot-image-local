# Photo to Cartoon

Transform family photos into anime/cartoon art using local AI inference.

## Features

- 🔒 PIN-protected family access
- 🎨 Two styles: Anime & Cartoon (Pixar-style)
- 🖼️ Local AI processing with ComfyUI + ToonYou
- 🚫 No cloud storage - images deleted immediately
- 📱 Mobile-friendly UI

## Quick Start

### Prerequisites

- Node.js 18+
- [ComfyUI Portable](https://github.com/comfyanonymous/ComfyUI/releases) (Windows)
- [ToonYou Beta 6](https://civitai.com/models/30240) model
- [ngrok](https://ngrok.com/) (for remote access)

### 1. Setup ComfyUI

1. Extract ComfyUI to `E:\ComfyUI_windows_portable`
2. Place model in `ComfyUI\models\checkpoints\toonyou_beta6.safetensors`

### 2. Configure Environment

```bash
# Frontend (.env.local)
cp .env.example .env.local
# Edit: NEXT_PUBLIC_API_URL=http://localhost:3001

# Orchestrator (orchestrator/.env)
cp orchestrator/.env.example orchestrator/.env
# Edit: FAMILY_PIN=your-secure-pin
```

### 3. Install & Run

```bash
# Terminal 1: ComfyUI
cd E:\ComfyUI_windows_portable
.\run_nvidia_gpu.bat

# Terminal 2: Orchestrator
cd orchestrator
npm install
npm run dev

# Terminal 3: Frontend
bun install
bun run dev

# Terminal 4 (optional): ngrok for remote access
ngrok http 3001
```

### 4. Access

- **Local:** http://localhost:3000
- **Phone (same WiFi):** http://YOUR_LAPTOP_IP:3000
- **Remote:** Update `.env.local` with ngrok URL

## Project Structure

```
├── app/                  # Next.js pages
├── components/           # React components
│   └── photo-transformer.tsx
├── orchestrator/         # Backend API
│   └── src/index.ts
├── .env.example          # Frontend env template
└── orchestrator/.env.example  # API env template
```

## Security

- PIN authentication for family access
- No images stored on server
- Temp files deleted after processing
- No logging of images or prompts

## Tech Stack

- **Frontend:** Next.js 16, TypeScript, Tailwind, shadcn/ui
- **Backend:** Node.js, Express, TypeScript
- **AI:** ComfyUI, Stable Diffusion 1.5 (ToonYou)

## License

MIT
