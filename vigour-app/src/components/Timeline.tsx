import { useEffect, useRef } from "react";

export interface TimelineEntry {
  id: string;
  timestamp: number;
  state: "idle" | "listening" | "thinking" | "executing" | "speaking" | "complete" | "error";
  label: string;
  detail?: string;
}

interface TimelineProps {
  entries: TimelineEntry[];
}

export function Timeline({ entries }: TimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="timeline">
        <div className="config-notice">
          Vigour is ready.<br />
          Say "Hello, Vigour!" to get started.
        </div>
      </div>
    );
  }

  return (
    <div className="timeline">
      {entries.map((e) => (
        <div key={e.id} className={`entry ${e.state}`}>
          <div className="label">{e.label}</div>
          {e.detail && <div className="detail">{e.detail}</div>}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
