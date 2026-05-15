import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:http/http.dart' as http;
import 'package:permission_handler/permission_handler.dart';
import 'package:zego_express_engine/zego_express_engine.dart';
import 'zego_service.dart';

class MainPage extends StatefulWidget {
  const MainPage({super.key});

  @override
  State<MainPage> createState() => _MainPageState();
}

class _MainPageState extends State<MainPage> {
  // ========== User Info ==========
  late String userId;

  // ========== ZEGO Service ==========
  final ZegoService _zegoService = ZegoService();

  // ========== State ==========
  bool isConnected = false;
  bool isMicOn = true;
  bool isLoading = false;
  String statusText = 'Ready';
  String? agentInstanceId;
  String? currentAgentStreamId;

  // ========== Canvas View ==========
  Widget? _playViewWidget;
  int? _playViewID;

  // ========== Constants ==========
  static const String agentId = 'ai_avatar_agent';
  static const String digitalHumanId = 'c4b56d5c-db98-4d91-86d4-5a97b507da97';

  // ========== Config ==========
  late int appID;
  late String apiBaseUrl;

  @override
  void initState() {
    super.initState();

    // Read config from .env with environment variable fallback
    appID = int.tryParse(
          dotenv.env['ZEGO_APPID'] ??
              const String.fromEnvironment('ZEGO_APPID') ??
              '',
        ) ??
        0;

    apiBaseUrl = dotenv.env['ZEGO_API_BASE_URL'] ??
        const String.fromEnvironment('ZEGO_API_BASE_URL') ??
        'http://localhost:3000';
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    // Get userId from route arguments
    final args = ModalRoute.of(context)?.settings.arguments;
    if (args != null && args is String) {
      userId = args;
    } else {
      userId = 'user_${DateTime.now().millisecondsSinceEpoch}';
    }

    // Create canvas view after first frame
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initCanvasView();
    });
  }

  Future<void> _initCanvasView() async {
    final widget = await _zegoService.createCanvasView((viewID) {
      _playViewID = viewID;
    });
    if (mounted) {
      setState(() {
        _playViewWidget = widget;
      });
    }
  }

  // ========== Start Conversation (Full Flow) ==========

  Future<void> startConversation() async {
    // Check audio permission first
    final status = await Permission.microphone.request();
    if (!status.isGranted) {
      _updateStatus('Audio permission is required for voice interaction');
      return;
    }

    if (isLoading) return;
    setState(() => isLoading = true);

    try {
      // Step 0: Cleanup stale instances
      _updateStatus('Cleaning up...');
      await _cleanupAllInstances();

      // Step 1: Register agent
      _updateStatus('Registering AI Agent...');
      await _registerAgent();

      // Step 2: Generate IDs (timestamp is used ONCE for consistency)
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final roomId = 'room_$timestamp';
      final userStreamId = 'user_stream_${userId}_$timestamp';
      final agentStreamId = 'agent_stream_$timestamp';
      final agentUserId = 'agent_user_$timestamp';

      // Step 3: Create digital human instance
      _updateStatus('Creating digital human instance...');
      final instanceData = await _createInstance(
        userId,
        roomId,
        agentStreamId,
        agentUserId,
        userStreamId,
      );
      agentInstanceId = instanceData?['agentInstanceId'] as String?;
      currentAgentStreamId =
          instanceData?['agentStreamId'] as String? ?? agentStreamId;

      // Step 4: Get token
      _updateStatus('Getting token...');
      final token = await _getToken(userId);
      if (token == null || token.isEmpty) {
        _updateStatus('Error: Failed to get token');
        setState(() => isLoading = false);
        return;
      }

      // Step 5: Create ZEGO engine
      _updateStatus('Creating engine...');
      _zegoService.createEngine(appID);

      // Step 6: Set event handlers
      _setEventHandlers();

      // Step 7: Login room (await to ensure success before publishing)
      _updateStatus('Logging into room...');
      final loginResult = await _zegoService.loginRoom(roomId, userId, token);
      if (loginResult.errorCode != 0) {
        _updateStatus('Login failed: ${loginResult.errorCode}');
        _cleanupLocal();
        setState(() => isLoading = false);
        return;
      }

      // Step 8: Start publishing audio (same userStreamId as step 3!)
      _updateStatus('Publishing audio...');
      _zegoService.startPublishingStream(userStreamId);

      _updateStatus('Publishing audio, waiting for AI Avatar...');
    } catch (e) {
      _updateStatus('Error: $e');
      _cleanupLocal();
    } finally {
      setState(() => isLoading = false);
    }
  }

  void _setEventHandlers() {
    // Stream update callback - detect agent stream
    _zegoService.setOnRoomStreamUpdate((roomID, updateType, streamList, extendedData) {
      if (updateType == ZegoUpdateType.Add) {
        for (final stream in streamList) {
          debugPrint('Stream ADD: ${stream.streamID}');
          currentAgentStreamId = stream.streamID;
          _startPlayingAgentStream(stream.streamID);
        }
      } else if (updateType == ZegoUpdateType.Delete) {
        for (final stream in streamList) {
          debugPrint('Stream DELETE: ${stream.streamID}');
          _zegoService.stopPlayingStream(stream.streamID);
        }
      }
    });

    // Room state changed
    _zegoService.setOnRoomStateChanged((roomID, reason, errorCode, extendedData) {
      debugPrint('Room state changed: roomID=$roomID, reason=$reason, error=$errorCode');
      if (errorCode != 0) {
        _updateStatus('Room error: $errorCode');
      }
    });

    // Publisher state update
    _zegoService.setOnPublisherStateUpdate((streamID, state, errorCode, extendedData) {
      debugPrint('Publisher state: streamID=$streamID, state=$state, error=$errorCode');
    });

    // Player state update
    _zegoService.setOnPlayerStateUpdate((streamID, state, errorCode, extendedData) {
      debugPrint('Player state: streamID=$streamID, state=$state, error=$errorCode');
    });
  }

  void _startPlayingAgentStream(String streamId) {
    if (_playViewID != null) {
      _zegoService.startPlayingStream(streamId, _playViewID!);
    } else {
      // Fallback: audio only
      _zegoService.startPlayingStreamAudioOnly(streamId);
    }

    setState(() {
      isConnected = true;
      isMicOn = true;
    });
    _updateStatus('Playing');
  }

  // ========== End Conversation ==========

  Future<void> endConversation() async {
    setState(() => isLoading = true);
    _updateStatus('Ending conversation...');

    try {
      // Delete agent instance on server
      if (agentInstanceId != null) {
        await _deleteInstance(agentInstanceId!);
      }
    } catch (e) {
      debugPrint('Delete instance error: $e');
    }

    _cleanupLocal();
    _updateStatus('Ready');
    setState(() => isLoading = false);
  }

  void _cleanupLocal() {
    // Stop playing stream
    if (currentAgentStreamId != null) {
      _zegoService.stopPlayingStream(currentAgentStreamId!);
    }

    // Stop publishing
    _zegoService.stopPublishingStream();

    // Logout room
    _zegoService.logoutRoom();

    // Destroy engine
    _zegoService.destroyEngine();

    // Reset state
    setState(() {
      isConnected = false;
      isMicOn = true;
      agentInstanceId = null;
      currentAgentStreamId = null;
    });

    // Recreate canvas view for next session
    _initCanvasView();
  }

  // ========== Toggle Mic ==========

  void toggleMic() {
    setState(() {
      isMicOn = !isMicOn;
    });
    _zegoService.muteMicrophone(!isMicOn);
  }

  // ========== Server API Calls ==========

  Future<void> _registerAgent() async {
    final url = Uri.parse('$apiBaseUrl/api/agent');
    final response = await http.post(
      url,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'agentId': agentId,
        'agentName': 'AI Avatar',
      }),
    );

    final result = jsonDecode(response.body) as Map<String, dynamic>;
    if (result['code'] != 0) {
      throw Exception('Register agent failed: ${result['message']}');
    }
  }

  Future<Map<String, dynamic>?> _createInstance(
    String userId,
    String roomId,
    String agentStreamId,
    String agentUserId,
    String userStreamId,
  ) async {
    final url = Uri.parse('$apiBaseUrl/api/instance');
    final response = await http.post(
      url,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'agentId': agentId,
        'userId': userId,
        'roomId': roomId,
        'agentStreamId': agentStreamId,
        'agentUserId': agentUserId,
        'userStreamId': userStreamId,
        'digitalHumanId': digitalHumanId,
      }),
    );

    final result = jsonDecode(response.body) as Map<String, dynamic>;
    if (result['code'] != 0) {
      throw Exception('Create instance failed: ${result['message']}');
    }
    return result['data'] as Map<String, dynamic>?;
  }

  Future<String?> _getToken(String userId) async {
    final url = Uri.parse('$apiBaseUrl/api/token?userId=$userId');
    final response = await http.get(url);
    final result = jsonDecode(response.body) as Map<String, dynamic>;
    return result['token'] as String?;
  }

  Future<void> _deleteInstance(String instanceId) async {
    final url = Uri.parse('$apiBaseUrl/api/instance');
    await http.delete(
      url,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'agentInstanceId': instanceId}),
    );
  }

  Future<void> _cleanupAllInstances() async {
    final url = Uri.parse('$apiBaseUrl/api/instance');
    try {
      await http.delete(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({}),
      );
    } catch (e) {
      debugPrint('Cleanup instances error (ignoring): $e');
    }
  }

  // ========== UI Helpers ==========

  void _updateStatus(String text) {
    if (mounted) {
      setState(() {
        statusText = text;
      });
    }
  }

  // ========== Build UI ==========

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !isConnected,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop && isConnected) {
          endConversation();
        }
      },
      child: Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              // Header
              _buildHeader(),
              // Video Container
              Expanded(child: _buildVideoContainer()),
              // Controls
              _buildControls(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      color: const Color(0xFF16213E),
      child: Row(
        children: [
          const Expanded(
            child: Text(
              'AI Avatar Demo',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isConnected
                      ? Colors.greenAccent
                      : const Color(0xFF9E9E9E),
                ),
              ),
              const SizedBox(width: 6),
              Text(
                statusText,
                style: TextStyle(
                  color: isConnected
                      ? const Color(0xFF00D9FF)
                      : const Color(0xFF9E9E9E),
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildVideoContainer() {
    return Container(
      color: const Color(0xFF0F3460),
      child: Stack(
        children: [
          // Video view (TextureView via createCanvasView)
          if (_playViewWidget != null)
            Positioned.fill(
              child: _playViewWidget!,
            ),

          // Placeholder when not connected
          if (!isConnected)
            const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.videocam_off,
                    size: 48,
                    color: Color(0xFF616161),
                  ),
                  SizedBox(height: 12),
                  Text(
                    'AI Avatar Video\nWill Appear Here',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Color(0xFF9E9E9E),
                      fontSize: 16,
                    ),
                  ),
                ],
              ),
            ),

          // Loading overlay
          if (isLoading)
            Container(
              color: Colors.black54,
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(
                      color: Color(0xFF00D9FF),
                    ),
                    SizedBox(height: 16),
                    Text(
                      'Connecting...',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildControls() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      color: const Color(0xFF16213E),
      child: Row(
        children: [
          // Mic Toggle Button
          Expanded(
            child: ElevatedButton(
              onPressed: isConnected ? toggleMic : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: isConnected
                    ? (isMicOn
                        ? const Color(0xFF00C853)
                        : const Color(0xFFFF5252))
                    : const Color(0xFF424242),
                foregroundColor: Colors.white,
                disabledBackgroundColor: const Color(0xFF424242),
                disabledForegroundColor: const Color(0xFF9E9E9E),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    isMicOn ? Icons.mic : Icons.mic_off,
                    size: 18,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    isMicOn ? 'Mic ON' : 'Mic OFF',
                    style: const TextStyle(fontSize: 14),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(width: 12),

          // Start/End Conversation Button
          Expanded(
            flex: 2,
            child: ElevatedButton(
              onPressed: isLoading
                  ? null
                  : (isConnected ? endConversation : startConversation),
              style: ElevatedButton.styleFrom(
                backgroundColor: isConnected
                    ? const Color(0xFFFF5252)
                    : const Color(0xFF00D9FF),
                foregroundColor: isConnected ? Colors.white : Colors.black,
                disabledBackgroundColor: const Color(0xFF424242),
                disabledForegroundColor: const Color(0xFF9E9E9E),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    isConnected ? Icons.call_end : Icons.play_arrow,
                    size: 18,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    isConnected ? 'End Conversation' : 'Start Conversation',
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}