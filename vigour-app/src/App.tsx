import { useState, useEffect } from "react";
import { Timeline, type TimelineEntry } from "./components/Timeline.js";
import { AvatarCanvas } from "./components/AvatarCanvas.js";
import { connectCortex, type AgentState, type CortexMessage } from "./lib/websocket-client.js";
import "./styles.css";

let entryId = 0;

export default function App() {
  const [state, setState] = useState<AgentState>("idle");
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    function addEntry(label: string, detail?: string, entryState?: TimelineEntry["state"]) {
      setEntries((prev) => [
        ...prev,
        {
          id: String(++entryId),
          timestamp: Date.now(),
          state: entryState ?? "idle",
          label,
          detail,
        },
      ]);
    }

    addEntry("Vigour overlay ready", "Waiting for cortex connection");

    const ws = connectCortex((msg: CortexMessage) => {
      setConnected(true);
      addEntry("Cortex connected", "Voice agent is online");

      switch (msg.type) {
        case "state_change": {
          setState(msg.payload.state);
          addEntry(msg.payload.state, msg.payload.message, msg.payload.state as TimelineEntry["state"]);
          break;
        }
        case "transcript": {
          addEntry("Transcript", msg.payload.text, "listening");
          break;
        }
        case "gesture": {
          addEntry("Gesture", msg.payload.gesture, "executing");
          break;
        }
      }
    });

    return () => ws.close();
  }, []);

  return (
    <div className="overlay">
      <div className="header">
        <h1>Vigour</h1>
        <button className="toggle-btn" onClick={() => window.close()}>
          Hide
        </button>
      </div>

      <AvatarCanvas state={state} />

      <Timeline entries={entries} />

      <div className="status-bar">
        <span>
          <span className={`status-dot ${connected ? "online" : "offline"}`} />
          {connected ? "Connected" : "No agent"}
        </span>
        <span>localhost:3002</span>
      </div>
    </div>
  );
}
