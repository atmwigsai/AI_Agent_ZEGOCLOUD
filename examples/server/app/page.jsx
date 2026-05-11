export default function HomePage() {
  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: "0 20px", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Interactive AI Avatar - Server</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        This is the API server for the Interactive AI Avatar demo.
      </p>
      <div style={{ background: "#f5f5f5", padding: 20, borderRadius: 8 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Available API Endpoints</h2>
        <ul style={{ listStyle: "none", padding: 0, lineHeight: 2 }}>
          <li><code>GET /api/token?userId=xxx</code> - Generate ZEGO RTC Token</li>
          <li><code>POST /api/agent</code> - Register AI Agent</li>
          <li><code>POST /api/instance</code> - Create digital human agent instance</li>
          <li><code>DELETE /api/instance</code> - Delete agent instance</li>
          <li><code>POST /api/chat</code> - Send text to AI Agent</li>
        </ul>
      </div>
      <p style={{ marginTop: 24, color: "#999", fontSize: 14 }}>
        Please open the web client to interact with the AI Avatar.
      </p>
    </div>
  );
}
