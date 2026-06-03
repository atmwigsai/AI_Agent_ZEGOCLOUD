# AI Avatar Voice Interaction - Implementation Plan

## Project Overview

Flutter app for AI Avatar voice interaction on Android. Uses ZEGO Express SDK for RTC communication and a Next.js server for AI Agent management.

## Environment Setup

- Flutter SDK: `/home/doc/flutter/bin/flutter` (version 3.41.9)
- ANDROID_HOME: `/home/doc/Android/Sdk`
- JAVA_HOME: `/home/doc/android-studio/jbr`
- Android minimum API level: 21

## Dependencies

```yaml
dependencies:
  flutter:
    sdk: flutter
  zego_express_engine: ^3.10.3  # ZEGO Express SDK Flutter plugin
  http: ^1.2.0                   # HTTP client for server API calls
  flutter_dotenv: ^2.0.2         # .env file reader
  permission_handler: ^11.3.1    # Runtime permission management
```

## Implementation Steps

### Step 1: Project Configuration

1. Create `.env` file with ZEGO_API_BASE_URL
2. Modify `pubspec.yaml` to add dependencies
3. Modify `AndroidManifest.xml` to add permissions
4. Modify `build.gradle` to set minSdkVersion 21 and load .env assets

### Step 2: Login Page (login_page.dart)

1. Create username input field
2. Create login button
3. On login, navigate to MainPage with userId
4. Safe area handling

### Step 3: Zego Service (zego_service.dart)

1. Hold ZegoExpressEngine instance
2. Method: createEngine(appID) - calls ZegoExpressEngine.createEngineWithProfile
3. Method: setEventHandler(callbacks) - registers onRoomStreamUpdate, onRoomStateChanged, etc.
4. Method: loginRoom(roomId, userId, token) - calls engine.loginRoom
5. Method: startPublishingStream(streamId) - calls engine.enableCamera(false), engine.muteMicrophone(false), engine.startPublishingStream
6. Method: startPlayingStream(streamId, viewID) - calls engine.startPlayingStream with ZegoCanvas
7. Method: stopPlayingStream(streamId) - calls engine.stopPlayingStream
8. Method: stopPublishingStream() - calls engine.stopPublishingStream
9. Method: logoutRoom() - calls engine.logoutRoom
10. Method: destroyEngine() - calls ZegoExpressEngine.destroyEngine
11. Method: muteMicrophone(mute) - calls engine.muteMicrophone
12. Method: createCanvasView(onViewCreated) - calls engine.createCanvasView
13. Method: destroyCanvasView(viewID) - calls engine.destroyCanvasView

### Step 4: Main Page (main_page.dart)

1. Create video view area using createCanvasView (TextureView on Android)
2. Create status text, placeholder text
3. Create Start/End Conversation button
4. Create Mic ON/OFF button
5. Implement startConversation flow:
   a. Check audio permission
   b. Cleanup stale instances (DELETE /api/instance)
   c. Register agent (POST /api/agent)
   d. Generate IDs (timestamp, roomId, streamIds)
   e. Create instance (POST /api/instance) with streamId consistency
   f. Get token (GET /api/token)
   g. Create engine via ZegoService
   h. Set event handler via ZegoService
   i. Login room via ZegoService
   j. Start publishing stream via ZegoService (same userStreamId as step e)
6. Implement onRoomStreamUpdate callback to detect agent stream and start playing
7. Implement endConversation flow:
   a. Delete instance on server (DELETE /api/instance with agentInstanceId)
   b. Cleanup local via ZegoService (stop play, stop publish, logout, destroy)
8. Implement mic toggle via ZegoService.muteMicrophone
9. Handle permission request flow

### Step 5: Main App Entry (main.dart)

1. Load .env file
2. Set app theme (dark theme matching Kotlin version)
3. Define routes (LoginPage, MainPage)
4. Read ZEGO_APPID from environment variable fallback

## Key Code Snippets

### Stream ID Consistency (CRITICAL)
```dart
// Generate timestamp ONCE and reuse it
final timestamp = DateTime.now().millisecondsSinceEpoch;
final userStreamId = 'user_stream_${userId}_$timestamp';

// Use userStreamId in both:
// 1. Server API: createInstance(userId, roomId, agentStreamId, agentUserId, userStreamId)
// 2. ZEGO SDK: startPublishingStream(userStreamId)
// MUST be the same value!
```

### ZEGO Engine Creation
```dart
final profile = ZegoEngineProfile(
  appID,  // int, from env variable
  ZegoScenario.HighQualityChatroom,
  appSign: '',  // Using Token auth, not AppSign
);
ZegoExpressEngine.createEngineWithProfile(profile);
```

### Token-based Room Login
```dart
final user = ZegoUser.id(userId);
final config = ZegoRoomConfig.defaultConfig();
config.token = token;
config.isUserStatusNotify = true;
ZegoExpressEngine.instance.loginRoom(roomId, user, config: config);
```

### Canvas View for Video
```dart
_playViewWidget = await ZegoExpressEngine.instance.createCanvasView((viewID) {
  _playViewID = viewID;
  // Start playing when stream is available
  final canvas = ZegoCanvas.view(viewID);
  ZegoExpressEngine.instance.startPlayingStream(streamId, canvas: canvas);
});
```

### Audio Only Publishing
```dart
ZegoExpressEngine.instance.enableCamera(false);
ZegoExpressEngine.instance.muteMicrophone(false);
ZegoExpressEngine.instance.startPublishingStream(streamId);
```