import type { JourneyPoint } from './journey';

export type DiagramPoint = { x: number; y: number };
export const diagramWidth = 640;
export const diagramHeight = 340;

export function projectJourney(shape: JourneyPoint[]): DiagramPoint[] {
  if (shape.length < 2) return [];
  const start = shape[0];
  const lonScale = Math.cos(start.latitude * Math.PI / 180);
  const relative = shape.map(p => ({ x: (p.longitude - start.longitude) * lonScale, y: start.latitude - p.latitude }));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { x, y } of relative) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const scale = Math.min(500 / Math.max(maxX - minX, 1e-7), 190 / Math.max(maxY - minY, 1e-7));
  return relative.map(({ x, y }) => ({
    x: Math.round((diagramWidth / 2 + (x - (minX + maxX) / 2) * scale) * 100) / 100,
    y: Math.round((diagramHeight / 2 + (y - (minY + maxY) / 2) * scale) * 100) / 100,
  }));
}

export function measureDiagram(points: DiagramPoint[]) {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const length = cumulative[cumulative.length - 1];
  return {
    start: points[0],
    end: points[points.length - 1],
    path: points.map(({ x, y }, index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' '),
    at(progress: number): DiagramPoint {
      const target = length * Math.max(0, Math.min(1, progress));
      if (target === 0) return points[0];
      if (target === length) return points[points.length - 1];
      let low = 1, high = cumulative.length - 1;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (cumulative[middle] < target) low = middle + 1;
        else high = middle;
      }
      const segment = cumulative[low] - cumulative[low - 1];
      if (!segment) return points[low];
      const t = (target - cumulative[low - 1]) / segment;
      const a = points[low - 1], b = points[low];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    },
  };
}
