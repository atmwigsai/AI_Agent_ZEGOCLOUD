# AI Avatar Voice Interaction - Interaction Design

## Feature Overview

A Flutter app that enables voice-based interaction with an AI digital human avatar. Users log in with a username, then start a conversation where they speak to the AI avatar (video rendered via TextureView) and hear/see the avatar's response.

## User Flow

1. **Login Page**: User enters a username and clicks "Login"
2. **Main Page**: User sees a video placeholder area and control buttons
   - Click "Start Conversation" to begin
   - The app registers the AI Agent, creates a digital human instance, gets a token, then initializes ZEGO Express SDK, logs into room, publishes audio (mic), and plays the agent's video stream
   - Click "Mic ON/OFF" to toggle microphone
   - Click "End Conversation" to stop and clean up

## UI Layout

### Login Page
```
+----------------------------------+
|       Safe Area (top)            |
|                                  |
|   +----------------------------+ |
|   |  AI Avatar Demo            | |
|   +----------------------------+ |
|                                  |
|   +----------------------------+ |
|   |  Username Input            | |
|   +----------------------------+ |
|                                  |
|   +----------------------------+ |
|   |      [  Login  ]           | |
|   +----------------------------+ |
|                                  |
|       Safe Area (bottom)         |
+----------------------------------+
```

### Main Page
```
+----------------------------------+
|  [Header]          [Status Text] |
+----------------------------------+
|                                  |
|   +----------------------------+ |
|   |                            | |
|   |    Video Area              | |
|   |    (TextureView)           | |
|   |    OR Placeholder Text     | |
|   |                            | |
|   +----------------------------+ |
|                                  |
+----------------------------------+
|  [Mic ON/OFF]  [Start/End Conv] |
+----------------------------------+
```

## Core Interactions

| Trigger | Response |
|---------|----------|
| Click Login (with valid username) | Navigate to Main Page with userId |
| Click Start Conversation | Step 1: Cleanup stale instances -> Step 2: Register agent -> Step 3: Create instance -> Step 4: Get token -> Step 5: Create engine + login room + publish audio |
| Stream ADD callback | Start playing agent stream, hide placeholder, show video |
| Stream DELETE callback | Stop playing stream, show placeholder |
| Click Mic ON/OFF | Toggle muteMicrophone, update button text and color |
| Click End Conversation | Delete instance on server, cleanup local (stop play/publish, logout, destroy engine) |

## Data Flow

```
LoginPage -> userId -> MainPage
MainPage -> Server APIs (registerAgent, createInstance, getToken, deleteInstance)
MainPage -> ZEGO Express SDK (createEngine, loginRoom, startPublishingStream, startPlayingStream)
Server -> ZEGO AI Agent API (RegisterAgent, CreateDigitalHumanAgentInstance, DeleteAgentInstance)
ZEGO Cloud -> Agent stream (video + audio) -> MainPage (play via TextureView)
MainPage -> User audio (mic) -> ZEGO Cloud -> Agent (pulls user stream)
```