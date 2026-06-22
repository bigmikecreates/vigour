import { useEffect, useRef } from "react";
import type { AgentState } from "../lib/websocket-client.js";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
}

interface AvatarCanvasProps {
  state: AgentState;
}

const STATE_COLORS: Record<AgentState, string> = {
  idle: "#888",
  listening: "#4fc3f7",
  thinking: "#ffa726",
  executing: "#4fc3f7",
  speaking: "#ce93d8",
  confirming: "#ffa726",
  error: "#ef5350",
  auth_needed: "#ef5350",
};

const PARTICLE_COLORS: Record<AgentState, string[]> = {
  idle: [],
  listening: ["#4fc3f7", "#29b6f6", "#03a9f4", "#039be5"],
  thinking: ["#ffa726", "#ff9800", "#fb8c00", "#f57c00"],
  executing: ["#4fc3f7", "#29b6f6", "#03a9f4", "#039be5"],
  speaking: ["#ce93d8", "#ba68c8", "#ab47bc", "#9c27b0"],
  confirming: ["#ffa726", "#ff9800", "#fb8c00", "#f57c00"],
  error: ["#ef5350", "#e53935", "#d32f2f", "#c62828"],
  auth_needed: ["#ef5350", "#e53935", "#d32f2f", "#c62828"],
};

export function AvatarCanvas({ state }: AvatarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas!.getContext("2d")!;

    const size = 80;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * 2 * dpr;
    canvas.height = size * 2 * dpr;
    ctx.scale(dpr, dpr);
    const cx = size;
    const cy = size;
    const r = size - 14;

    let time = 0;
    let blinkTimer = 0;

    function spawnParticles() {
      const colors = PARTICLE_COLORS[state];
      if (!colors || colors.length === 0) return;

      const count = state === "speaking" ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.3 + Math.random() * 0.6;
        particlesRef.current.push({
          x: cx + Math.cos(angle) * r * 0.6,
          y: cy + Math.sin(angle) * r * 0.6,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.3,
          life: 0,
          maxLife: 40 + Math.random() * 30,
          radius: 1.5 + Math.random() * 2,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    }

    function updateParticles() {
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.01;
        p.life++;
        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
        }
      }
    }

    function drawParticles() {
      const particles = particlesRef.current;
      for (const p of particles) {
        const alpha = 1 - p.life / p.maxLife;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * alpha, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.round(alpha * 180).toString(16).padStart(2, "0");
        ctx.fill();
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      time += 0.02;

      const color = STATE_COLORS[state] || "#888";
      const isIdle = state === "idle";
      const isSpeaking = state === "speaking";
      const isListening = state === "listening";
      const isThinking = state === "thinking";
      const isError =
        state === "error" || state === "auth_needed";

      // Breathing
      const breathe = isIdle ? Math.sin(time) * 2 : 0;
      const bounce = isSpeaking ? Math.abs(Math.sin(time * 3)) * 4 : 0;
      const listenPulse = isListening ? Math.abs(Math.sin(time * 2)) * 3 : 0;
      const errorShake = isError ? Math.sin(time * 20) * 2 : 0;

      const bodyOffset = breathe + bounce + listenPulse + errorShake;
      const bodyR = r + (isListening ? listenPulse * 0.3 : 0);

      // Glow
      const glowSize = bodyR + 8 + Math.abs(Math.sin(time * 2)) * 4;
      const gradient = ctx.createRadialGradient(cx, cy, bodyR, cx, cy, glowSize);
      gradient.addColorStop(0, color + "20");
      gradient.addColorStop(1, color + "00");
      ctx.beginPath();
      ctx.arc(cx, cy + bodyOffset, glowSize, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Body
      ctx.beginPath();
      ctx.arc(cx, cy + bodyOffset, bodyR, 0, Math.PI * 2);
      ctx.fillStyle = color + (isIdle ? "20" : "30");
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Ring segments (for listening/thinking)
      if (isListening || isThinking) {
        const rotation = time * (isListening ? 0.5 : 1);
        ctx.beginPath();
        ctx.arc(
          cx,
          cy + bodyOffset,
          bodyR + 3,
          rotation,
          rotation + Math.PI * 1.5
        );
        ctx.strokeStyle = color + "60";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Eyes
      const eyeY = cy - 8 + bodyOffset;
      const eyeSpacing = 14;
      const eyeSize = 3.5;

      // Blink
      blinkTimer += 0.01;
      const isBlinking =
        (blinkTimer % 5 < 0.1) ||
        (blinkTimer % 5 > 2.5 && blinkTimer % 5 < 2.55);

      ctx.fillStyle = color;

      if (isBlinking) {
        // Closed eyes (line)
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - eyeSpacing - 3, eyeY);
        ctx.lineTo(cx - eyeSpacing + 3, eyeY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + eyeSpacing - 3, eyeY);
        ctx.lineTo(cx + eyeSpacing + 3, eyeY);
        ctx.stroke();
      } else {
        // Open eyes with pupils
        const pupilOffsetX = isThinking ? Math.sin(time * 3) * 1.5 : 0;
        const pupilOffsetY = isThinking ? Math.cos(time * 3) * 1 : 0;

        ctx.beginPath();
        ctx.arc(cx - eyeSpacing, eyeY, eyeSize, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx + eyeSpacing, eyeY, eyeSize, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.arc(
          cx - eyeSpacing + pupilOffsetX,
          eyeY + pupilOffsetY,
          1.5,
          0,
          Math.PI * 2
        );
        ctx.fill();

        ctx.beginPath();
        ctx.arc(
          cx + eyeSpacing + pupilOffsetX,
          eyeY + pupilOffsetY,
          1.5,
          0,
          Math.PI * 2
        );
        ctx.fill();

        ctx.fillStyle = color;
      }

      // Eyebrows (for thinking/error states)
      const browY = eyeY - 8;
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      if (isThinking) {
        ctx.beginPath();
        ctx.moveTo(cx - eyeSpacing - 4, browY - 1);
        ctx.lineTo(cx - eyeSpacing + 4, browY - 3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + eyeSpacing - 4, browY - 3);
        ctx.lineTo(cx + eyeSpacing + 4, browY - 1);
        ctx.stroke();
      } else if (isError) {
        ctx.beginPath();
        ctx.moveTo(cx - eyeSpacing - 4, browY);
        ctx.lineTo(cx - eyeSpacing + 4, browY + 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + eyeSpacing - 4, browY + 2);
        ctx.lineTo(cx + eyeSpacing + 4, browY);
        ctx.stroke();
      }

      // Mouth
      const mouthY = cy + 16 + bodyOffset;
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      if (isSpeaking) {
        // Animated open mouth
        const openAmount = Math.abs(Math.sin(time * 5)) * 5 + 2;
        ctx.beginPath();
        ctx.ellipse(cx, mouthY, 6, openAmount, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (isListening) {
        // Open circle (surprised/waiting)
        ctx.beginPath();
        ctx.arc(cx, mouthY, 3 + listenPulse * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (isSmiling(state)) {
        // Smile
        ctx.beginPath();
        ctx.arc(cx, mouthY - 2, 6, 0.15, Math.PI - 0.15);
        ctx.stroke();
      } else if (isError) {
        // Frown
        ctx.beginPath();
        ctx.arc(cx, mouthY + 4, 6, Math.PI + 0.15, -0.15);
        ctx.stroke();
      } else {
        // Neutral line
        ctx.beginPath();
        ctx.arc(cx, mouthY - 1, 6, 0.1, Math.PI - 0.1);
        ctx.stroke();
      }

      // Particles
      spawnParticles();
      updateParticles();
      drawParticles();

      frameRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [state]);

  return (
    <div className="avatar-area">
      <canvas ref={canvasRef} />
    </div>
  );
}

function isSmiling(state: AgentState) {
  return (
    state === "idle" ||
    state === "confirming"
  );
}
