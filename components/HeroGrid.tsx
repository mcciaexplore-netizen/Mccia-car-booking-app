import React, { useEffect, useRef } from 'react';

const CELL = 45;
const TRAIL_LENGTH = 6;

const HeroGrid: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let offset = 0;
    let hovered: { x: number; y: number; age: number }[] = [];
    let mouse: { x: number; y: number } | null = null;
    let raf = 0;

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const handleMouseLeave = () => { mouse = null; };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      if (!prefersReducedMotion) offset = (offset + 0.4) % CELL;

      // grid lines drifting diagonally
      ctx.strokeStyle = 'rgba(0,63,138,0.04)';
      ctx.lineWidth = 1;
      for (let x = -CELL; x < width + CELL; x += CELL) {
        ctx.beginPath();
        ctx.moveTo(x + offset, 0);
        ctx.lineTo(x + offset, height);
        ctx.stroke();
      }
      for (let y = -CELL; y < height + CELL; y += CELL) {
        ctx.beginPath();
        ctx.moveTo(0, y + offset);
        ctx.lineTo(width, y + offset);
        ctx.stroke();
      }

      // hover trail
      if (mouse) {
        const cx = Math.floor(mouse.x / CELL) * CELL;
        const cy = Math.floor(mouse.y / CELL) * CELL;
        const already = hovered.find(h => h.x === cx && h.y === cy);
        if (already) {
          already.age = 0;
        } else {
          hovered.unshift({ x: cx, y: cy, age: 0 });
          if (hovered.length > TRAIL_LENGTH) hovered.pop();
        }
      }
      hovered.forEach(h => { h.age += 1; });
      hovered = hovered.filter(h => h.age < 40);
      hovered.forEach(h => {
        const fade = 1 - h.age / 40;
        ctx.fillStyle = `rgba(0,63,138,${0.06 * fade})`;
        ctx.fillRect(h.x, h.y, CELL, CELL);
      });

      raf = requestAnimationFrame(draw);
    };

    resize();
    draw();

    window.addEventListener('resize', resize);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-card" aria-hidden="true">
      <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-accent-green/10 blur-3xl" />
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-auto" />
    </div>
  );
};

export default HeroGrid;
