"use client";

import { useEffect, useRef } from "react";
import type { WeatherMode } from "@/lib/map/atmosphere";

type Props = {
  weather: WeatherMode;
};

/**
 * Lightweight canvas weather overlay (rain/snow). Does not touch MapLibre GL state.
 */
export function WeatherOverlay({ weather }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;
    const particles: Array<{ x: number; y: number; speed: number; size: number; drift: number }> =
      [];

    const resize = (): void => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const count = weather === "sun" ? 0 : weather === "rain" ? 140 : 90;
    for (let i = 0; i < count; i += 1) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        speed: weather === "rain" ? 10 + Math.random() * 14 : 1.5 + Math.random() * 2.5,
        size: weather === "rain" ? 1 : 2 + Math.random() * 2,
        drift: (Math.random() - 0.5) * (weather === "snow" ? 1.2 : 0.3),
      });
    }

    const draw = (): void => {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (weather === "sun") {
        raf = requestAnimationFrame(draw);
        return;
      }

      ctx.strokeStyle = weather === "rain" ? "rgba(180,200,230,0.45)" : "rgba(255,255,255,0.75)";
      ctx.fillStyle = "rgba(255,255,255,0.85)";

      for (const p of particles) {
        p.y += p.speed;
        p.x += p.drift;
        if (p.y > canvas.height) {
          p.y = -8;
          p.x = Math.random() * canvas.width;
        }
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;

        if (weather === "rain") {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.drift * 2, p.y + 12);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [weather]);

  if (weather === "sun") return null;

  return (
    <canvas
      ref={canvasRef}
      className="weather-overlay"
      aria-hidden
    />
  );
}
