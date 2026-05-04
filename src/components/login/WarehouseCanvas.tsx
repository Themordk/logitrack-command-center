import { useEffect, useRef } from "react";

/**
 * "Warehouse Intelligence" animated background.
 * - 80px grid + dot intersections
 * - Radial pulse rings emitted ~every 1.8s from random intersections
 * - 18 floating particles
 * Respects prefers-reduced-motion and pauses when tab is hidden.
 */
export function WarehouseCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const GRID = 80;
    type Pulse = { x: number; y: number; t0: number };
    type Particle = { x: number; y: number; vx: number; vy: number; r: number };
    const pulses: Pulse[] = [];
    const particles: Particle[] = Array.from({ length: 18 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: 0.5 + Math.random() * 1.5,
    }));

    let lastPulse = performance.now();
    let raf = 0;

    const drawStatic = () => {
      ctx.clearRect(0, 0, width, height);
      // grid
      ctx.strokeStyle = "rgba(30, 70, 130, 0.18)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let x = 0; x <= width; x += GRID) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
      }
      for (let y = 0; y <= height; y += GRID) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
      }
      ctx.stroke();
      // dots
      ctx.fillStyle = "rgba(59, 130, 246, 0.25)";
      for (let x = 0; x <= width; x += GRID) {
        for (let y = 0; y <= height; y += GRID) {
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const tick = (now: number) => {
      if (document.hidden) {
        raf = requestAnimationFrame(tick);
        return;
      }
      drawStatic();

      // particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;
        ctx.fillStyle = "rgba(96, 165, 250, 0.35)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // emit pulses
      if (now - lastPulse > 1800) {
        lastPulse = now;
        const cx = Math.round((Math.random() * width) / GRID) * GRID;
        const cy = Math.round((Math.random() * height) / GRID) * GRID;
        pulses.push({ x: cx, y: cy, t0: now });
      }

      // draw pulses
      const PULSE_LIFE = 2400;
      const MAX_R = 160;
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        const age = now - p.t0;
        if (age > PULSE_LIFE) {
          pulses.splice(i, 1);
          continue;
        }
        const k = age / PULSE_LIFE;
        const r = k * MAX_R;
        const alpha = 0.6 * (1 - k);
        ctx.strokeStyle = `rgba(96, 165, 250, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      raf = requestAnimationFrame(tick);
    };

    if (reduced) {
      drawStatic();
    } else {
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ background: "#05101f" }}
    />
  );
}
