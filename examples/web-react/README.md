# Interactive AI Avatar - Web Client

React + Vite web client for the Interactive AI Avatar application.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env to set VITE_APP_ID and VITE_API_BASE_URL
```

## Run

```bash
npm run dev    # Development (http://localhost:5173)
npm run build  # Build for production
npm run preview # Preview production build
```

## Usage

1. Start the server first (see ../server/README.md)
2. Open http://localhost:5173 in a browser
3. Click "Start Conversation" to begin
4. Interact via voice (microphone) or text (type + send)
5. Click "End Conversation" to terminate

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| VITE_APP_ID | Yes | ZEGO App ID (fallback: ZEGO_APPID env var) |
| VITE_API_BASE_URL | Yes | Server API URL (default: http://localhost:3000) |

## Key Implementation Details

- **Single-file design**: All client logic is in `src/App.jsx` for readability
- **Audio-only stream**: Client publishes audio only (no video), plays agent's video+audio
- **Scenario 7**: Uses HIGH_QUALITY_CHATROOM scenario for best voice experience
- **Jitter buffer**: Optimized with jitterBufferTarget:500 for smooth playback
- **Auto video codec**: enableAutoSwitchVideoCodec:true for compatibility
