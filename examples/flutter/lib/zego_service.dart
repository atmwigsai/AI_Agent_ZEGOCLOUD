import 'package:flutter/widgets.dart';
import 'package:zego_express_engine/zego_express_engine.dart';

/// ZegoService holds the ZEGO Express Engine instance and provides direct
/// SDK method calls. This is a state holder, NOT an abstraction layer.
class ZegoService {
  // Engine instance
  ZegoExpressEngine? _engine;

  // Canvas view IDs
  int? _playViewID;
  Widget? _playViewWidget;

  // Whether engine is created
  bool isEngineCreated = false;

  // ========== Engine Lifecycle ==========

  /// Create ZEGO Express Engine with Token auth mode
  void createEngine(int appID) {
    if (isEngineCreated) return;

    final profile = ZegoEngineProfile(
      appID,
      ZegoScenario.HighQualityChatroom,
      appSign: '', // Using Token auth, not AppSign
    );

    ZegoExpressEngine.createEngineWithProfile(profile);
    _engine = ZegoExpressEngine.instance;
    isEngineCreated = true;
  }

  /// Destroy ZEGO Express Engine
  void destroyEngine() {
    if (!isEngineCreated) return;

    destroyCanvasView();
    ZegoExpressEngine.destroyEngine();
    _engine = null;
    isEngineCreated = false;
  }

  // ========== Event Handlers ==========

  /// Set room stream update callback - called directly from MainPage
  void setOnRoomStreamUpdate(
      Function(String, ZegoUpdateType, List<ZegoStream>, Map<String, dynamic>)
          callback) {
    ZegoExpressEngine.onRoomStreamUpdate = callback;
  }

  /// Set room state changed callback
  void setOnRoomStateChanged(
      Function(String, ZegoRoomStateChangedReason, int, Map<String, dynamic>)
          callback) {
    ZegoExpressEngine.onRoomStateChanged = callback;
  }

  /// Set publisher state update callback
  void setOnPublisherStateUpdate(
      Function(String, ZegoPublisherState, int, Map<String, dynamic>)
          callback) {
    ZegoExpressEngine.onPublisherStateUpdate = callback;
  }

  /// Set player state update callback
  void setOnPlayerStateUpdate(
      Function(String, ZegoPlayerState, int, Map<String, dynamic>)
          callback) {
    ZegoExpressEngine.onPlayerStateUpdate = callback;
  }

  // ========== Room Operations ==========

  /// Login room with Token, returns login result
  Future<ZegoRoomLoginResult> loginRoom(String roomId, String userId, String token) async {
    final user = ZegoUser.id(userId);
    final config = ZegoRoomConfig.defaultConfig();
    config.token = token;
    config.isUserStatusNotify = true;

    return ZegoExpressEngine.instance.loginRoom(roomId, user, config: config);
  }

  /// Logout room
  void logoutRoom() {
    if (isEngineCreated) {
      ZegoExpressEngine.instance.logoutRoom();
    }
  }

  // ========== Publishing ==========

  /// Start publishing audio stream (voice-only, no camera)
  void startPublishingStream(String streamId) {
    ZegoExpressEngine.instance.enableCamera(false);
    ZegoExpressEngine.instance.muteMicrophone(false);
    ZegoExpressEngine.instance.startPublishingStream(streamId);
  }

  /// Stop publishing stream
  void stopPublishingStream() {
    if (isEngineCreated) {
      ZegoExpressEngine.instance.stopPublishingStream();
    }
  }

  // ========== Playing ==========

  /// Start playing stream with canvas view
  void startPlayingStream(String streamId, int viewID) {
    final canvas = ZegoCanvas.view(viewID);
    ZegoExpressEngine.instance.startPlayingStream(streamId, canvas: canvas);
  }

  /// Start playing stream without canvas (audio only)
  void startPlayingStreamAudioOnly(String streamId) {
    ZegoExpressEngine.instance.startPlayingStream(streamId);
  }

  /// Stop playing stream
  void stopPlayingStream(String streamId) {
    if (isEngineCreated) {
      ZegoExpressEngine.instance.stopPlayingStream(streamId);
    }
  }

  // ========== Canvas View ==========

  /// Create canvas view for video rendering (TextureView on Android)
  Future<Widget?> createCanvasView(Function(int) onViewCreated) async {
    _playViewWidget = await ZegoExpressEngine.instance.createCanvasView(
      (viewID) {
        _playViewID = viewID;
        onViewCreated(viewID);
      },
    );
    return _playViewWidget;
  }

  /// Destroy canvas view
  void destroyCanvasView() {
    if (_playViewID != null) {
      ZegoExpressEngine.instance.destroyCanvasView(_playViewID!);
      _playViewID = null;
      _playViewWidget = null;
    }
  }

  /// Get current play view ID
  int? get playViewID => _playViewID;

  // ========== Audio Controls ==========

  /// Mute/unmute microphone
  void muteMicrophone(bool mute) {
    if (isEngineCreated) {
      ZegoExpressEngine.instance.muteMicrophone(mute);
    }
  }
}