import type { AnimationLifecycle } from "./types.js";

/**
 * Particles — slow drift with short-range connective lines. Density scales
 * with canvas area so phone-sized windows don't melt. The pair loop is O(n²)
 * but n is tiny (~100 on a 1080p monitor), which is fine.
 */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

const AREA_PER_PARTICLE = 18000;
const MAX_LINK_DIST = 100;
const MAX_LINK_DIST_SQ = MAX_LINK_DIST * MAX_LINK_DIST;

export class ParticlesAnimation implements AnimationLifecycle {
  private particles: Particle[] = [];

  init(width: number, height: number): void {
    const count = Math.max(20, Math.floor((width * height) / AREA_PER_PARTICLE));
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        size: 1 + Math.random() * 1.5,
        alpha: 0.3 + Math.random() * 0.4,
      });
    }
  }

  resize(width: number, height: number): void {
    // Re-run init to match the new density target. Cheap (just allocations)
    // and prevents clumps near the previous top-left.
    this.init(width, height);
  }

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dt: number,
    speed: number
  ): void {
    const step = dt * 0.1 * speed;
    for (const p of this.particles) {
      p.x += p.vx * step;
      p.y += p.vy * step;
      if (p.x < 0) p.x = width;
      else if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      else if (p.y > height) p.y = 0;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 0.5;

    for (let i = 0; i < this.particles.length; i++) {
      const a = this.particles[i]!;
      for (let j = i + 1; j < this.particles.length; j++) {
        const b = this.particles[j]!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < MAX_LINK_DIST_SQ) {
          const alpha = (1 - distSq / MAX_LINK_DIST_SQ) * 0.18;
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const p of this.particles) {
      ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
