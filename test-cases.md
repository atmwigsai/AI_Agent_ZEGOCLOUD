# Test Cases - Interactive AI Avatar (Web)

> Platform: Web | Users: 1 (single user) | Core features only

## Test Cases

| TC# | Device/Tab | Test Case | Steps | Expected Result |
|-----|-----------|-----------|-------|-----------------|
| TC-01 | Tab: main | Page Load | Open the web application URL | The page loads with "Interactive AI Avatar" header, video placeholder area, mic button, and "Start Conversation" button visible |
| TC-02 | Tab: main | Start Conversation | Click the "Start Conversation" button | Status changes from "Ready" to show progress steps (Registering, Creating instance, Getting token, Logging in, etc.), then finally shows "Playing" status with a green connected dot |
| TC-03 | Tab: main | AI Avatar Video Stream | After starting conversation, observe the video container area | The video container shows the AI Avatar's video stream rendering. The status bar shows "Playing" with room info |
| TC-04 | Tab: main | Toggle Microphone | Click the "Mic ON" button | The button text changes to "Mic OFF" and the button color changes from blue to orange, indicating microphone is muted |
| TC-05 | Tab: main | Toggle Microphone Back | Click the "Mic OFF" button | The button text changes back to "Mic ON" and the button color changes from orange to blue, indicating microphone is unmuted |
| TC-06 | Tab: main | End Conversation | Click the "End Conversation" button | Status changes to "Ready", the video container returns to the placeholder state, the "Start Conversation" button appears again, and the connection dot is no longer green |
