'use client';

import { useId, useMemo } from 'react';
import { Bike, CarFront, Footprints } from 'lucide-react';
import { diagramHeight, diagramWidth, measureDiagram, type DiagramPoint } from '@/lib/campus-mate/route-diagram';
import type { JourneyMode } from '@/lib/campus-mate/journey';
import motion from './journey-motion.module.css';

export function Motorbike({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="5.5" cy="17" r="3.1" /><circle cx="18.5" cy="17" r="3.1" />
    <path d="m18.5 17-3-9-2-1m-2 5-3.5-1.4H5.3m.2 6.4 4-5h6l-3.2 5H5.5M18 10h2" />
  </svg>;
}

export const journeyIcons = { walk: Footprints, bike: Bike, motor: Motorbike, car: CarFront };
const avatarSprites = {
  walk: <g stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
    <circle cx="12.5" cy="4.3" r="2.2" fill="#fff" stroke="none" /><path d="m5 12 4-3 3.5-.8 3 3.8 3.5 1m-8.8-3.5-1.3 5.1" />
    <path className={motion.strideA} d="M9 14.5 6 21" /><path className={motion.strideB} d="m9 14.5 4.5 2.1 2.6 4.4" />
  </g>,
  bike: <g stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none">
    <circle cx="5" cy="17.5" r="3.5" /><circle cx="19" cy="17.5" r="3.5" /><circle cx="13.8" cy="5" r="2" fill="#fff" stroke="none" />
    <path className={motion.wheel} d="M5 15.3v4.4m-2.2-2.2h4.4" strokeWidth=".8" /><path className={motion.wheel} d="M19 15.3v4.4m-2.2-2.2h4.4" strokeWidth=".8" />
    <path d="m5 17.5 5-7 4 7H5m9 0 3-8 2 8m-2-8-3.5 1-2.5-3-3 3m0 0 3.7 3-1 4" />
  </g>,
  motor: <g stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
    <circle cx="5.5" cy="17" r="3.1" /><circle cx="18.5" cy="17" r="3.1" /><circle cx="13.7" cy="5" r="2" fill="#fff" stroke="none" />
    <path className={motion.wheel} d="M5.5 15v4m-2-2h4" strokeWidth=".7" /><path className={motion.wheel} d="M18.5 15v4m-2-2h4" strokeWidth=".7" />
    <path d="m18.5 17-3-7-3-.5L10 8l-2 3m3.5 1-3.7-1.4H5.3m.2 6.4 4-5h6l-3.2 5H5.5" />
  </g>,
  car: <g stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none">
    <path d="M3 17v-5l2.3-5h13.4l2.3 5v5H3Zm0-5h18m-15 3h2m8 0h2M5 17v2m14-2v2" />
  </g>,
};

export function JourneyDiagram({ points, progress, mode, playing, demo = false }: {
  points: DiagramPoint[]; progress: number; mode: JourneyMode; playing: boolean; demo?: boolean;
}) {
  const id = useId();
  const measure = useMemo(() => points.length > 1 ? measureDiagram(points) : null, [points]);
  const marker = measure?.at(progress);
  return <div className="relative isolate overflow-hidden bg-[#0b2724] text-white">
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2 sm:inset-x-5 sm:top-5">
      <span className="rounded-full border border-emerald-200/25 bg-[#102e2c] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-emerald-100">{demo ? 'Demo · not directions' : measure ? 'Route preview' : 'The journey starts here'}</span>
      <span className="rounded-full bg-[#102e2c] px-2.5 py-1 text-[10px] font-semibold text-emerald-100">N ↑</span>
    </div>
    <svg viewBox={`0 0 ${diagramWidth} ${diagramHeight}`} className="block min-h-44 w-full" role="img" aria-label={demo ? 'Illustrative animated journey demo' : measure ? 'Route diagram with departure, journey avatar and destination' : 'No route is plotted yet'}>
      <defs>
        <pattern id={id + '-grid'} width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#a9ddc4" opacity=".15" />
        </pattern>
        <radialGradient id={id + '-glow'}>
          <stop offset="0" stopColor="#23634e" /><stop offset="1" stopColor="#0b2724" />
        </radialGradient>
      </defs>
      <rect width={diagramWidth} height={diagramHeight} fill={`url(#${id}-glow)`} />
      <rect width={diagramWidth} height={diagramHeight} fill={`url(#${id}-grid)`} />
      {measure && marker ? <>
        <path d={measure.path} fill="none" stroke="#071e1b" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" />
        <path d={measure.path} fill="none" stroke="#78ab99" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        {progress > 0 && <path d={measure.path} pathLength="1" strokeDasharray={`${progress} 2`} fill="none" stroke="#6ef2b5" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />}
        <circle cx={measure.start.x} cy={measure.start.y} r="9" fill="#f0fff6" stroke="#122d29" strokeWidth="4" />
        <g transform={`translate(${measure.end.x},${measure.end.y})`}>
          <circle r="8" fill="#ffce78" stroke="#102e2c" strokeWidth="4" />
          <path d="M0 -6v-26m0 0h24l-5 6 5 6H0" fill="#ffce78" stroke="#102e2c" strokeWidth="2.5" strokeLinejoin="round" />
        </g>
        <g transform={`translate(${marker.x},${marker.y})`}>
          <circle r="26" fill="#82ffb9" opacity=".23" className={playing ? 'motion-safe:animate-pulse' : ''} />
          <circle r="19" fill="#076444" stroke="#a6ffd0" strokeWidth="2" />
          <g transform="translate(-12 -12)" className={playing ? motion.moving : undefined}>{avatarSprites[mode]}</g>
        </g>
      </> : <g transform="translate(320 164)" stroke="#a8ecd2" strokeWidth="2" fill="none">
        <circle r="58" strokeDasharray="4 8" opacity=".55" /><circle r="40" opacity=".4" />
        <path d="m-17 18 12-40 13 15 16 10-41 15zm12-40v40m13-25v17" strokeLinejoin="round" />
      </g>}
    </svg>
    <div className="flex items-center justify-between gap-2 border-t border-emerald-100/10 px-3 py-2.5 text-[10px] font-medium text-emerald-50/90 sm:px-5 sm:text-xs">
      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-50" /> Start</span>
      <span className="text-center">Diagram · no live traffic</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-300" /> Destination</span>
    </div>
  </div>;
}
