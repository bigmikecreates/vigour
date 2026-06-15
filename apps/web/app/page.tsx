import { AGENT_STATES } from "@vigour/shared";

export default function Page() {
  return (
    <main
      style={{
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 24px",
        color: "#111",
      }}
    >
      <h1 style={{ marginBottom: 4 }}>Vigour</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Voice-first visual Slack agent — scaffold placeholder.
      </p>

      <h2 style={{ marginTop: 32 }}>Visual agent states</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {AGENT_STATES.map((s) => (
          <code
            key={s}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              background: "#f3f3f5",
              fontSize: 13,
            }}
          >
            {s}
          </code>
        ))}
      </div>

      <p style={{ color: "#999", fontSize: 14, marginTop: 32 }}>
        Phase 3 replaces this with the live avatar + action trace over WebSocket/SSE.
      </p>
    </main>
  );
}
