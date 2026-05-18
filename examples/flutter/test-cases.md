# AI Avatar Flutter - Test Cases

## TC-01: Login Page Display
- Launch the app
- Verify login page is displayed with username input field and login button
- Expected: Username input field and "Login" button visible

## TC-02: Login Navigation
- Enter username "TestUser"
- Click Login button
- Expected: Navigate to main page with Start Conversation button visible

## TC-03: Main Page Initial State
- After login, verify main page elements
- Expected: Video area, Start Conversation button visible

## TC-04: Start Conversation
- Click Start Conversation button
- Expected: Button text changes, mic toggle and end conversation buttons appear

## TC-05: End Conversation
- After starting conversation, click End Conversation
- Expected: Returns to initial state with Start Conversation button
