const WS_URL = "ws://127.0.0.1:9000";

export type AgentState =
  | "idle"
  | "listening"
  | "thinking"
  | "executing"
  | "speaking"
  | "confirming"
  | "error"
  | "auth_needed";

export interface StateMessage {
  type: "state_change";
  payload: { state: AgentState; message?: string };
}

export interface TranscriptMessage {
  type: "transcript";
  payload: { text: string };
}

export interface GestureMessage {
  type: "gesture";
  payload: { gesture: "nod" | "shake" | "smile" };
}

export type CortexMessage = StateMessage | TranscriptMessage | GestureMessage;

export type MessageHandler = (msg: CortexMessage) => void;

export function connectCortex(onMessage: MessageHandler): WebSocket {
  const ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("[vigour] connected to cortex");
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as CortexMessage;
      onMessage(msg);
    } catch (err) {
      console.error("[vigour] invalid cortex message:", err);
    }
  };

  ws.onerror = (err) => {
    console.error("[vigour] cortex ws error:", err);
  };

  ws.onclose = () => {
    console.log("[vigour] cortex ws closed");
  };

  return ws;
}
