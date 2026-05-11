# Interactive AI Avatar - Server

Next.js server providing API endpoints for the Interactive AI Avatar application.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env to set APP_ID and SERVER_SECRET
```

## Run

```bash
npm run dev    # Development
npm run build  # Build for production
npm start      # Run production build
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/token?userId=xxx` | GET | Generate ZEGO RTC Token |
| `/api/agent` | POST | Register AI Agent with LLM/TTS/ASR config |
| `/api/instance` | POST | Create digital human agent instance |
| `/api/instance` | DELETE | Delete agent instance |
| `/api/chat` | POST | Send text message to AI Agent |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| APP_ID | Yes | ZEGO App ID (fallback: ZEGO_APPID env var) |
| SERVER_SECRET | Yes | ZEGO Server Secret (fallback: ZEGO_SERVER_SECRET env var) |
| TOKEN_EXPIRE_SECONDS | No | Token validity in seconds (default: 3600) |
