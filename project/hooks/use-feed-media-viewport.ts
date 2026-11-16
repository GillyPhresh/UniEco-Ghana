'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { chooseFeedPlayback } from '@/lib/community/feed-experience';

type Visibility = { near: boolean; active: boolean; preload: boolean };
const offscreen = { near: false, active: false, preload: false } as const;
type Entry = { playable: boolean; visibility: Visibility; update: (value: Visibility) => void };
const entries = new Map<HTMLElement, Entry>();
const nearby = new Set<HTMLElement>();
let intersect: IntersectionObserver | null = null;
let requestedFrame = 0;
let manuallySelected: HTMLElement | null = null;
let manualScrollPosition = 0;

function measure() {
  // Keep tap focus through small layout shifts, but let an intentional scroll
  // hand off to the next clip even when two clips still fit on a large screen.
  if (manuallySelected && Math.abs(window.scrollY - manualScrollPosition) >= 80) manuallySelected = null;
  const navigation = document.querySelector<HTMLElement>('[aria-label="Mobile bottom navigation"]');
  const viewport = { top: 68, bottom: Math.max(69, window.innerHeight - (navigation?.offsetHeight ?? 0)) };
  const bounds = Array.from(nearby).flatMap((node) => {
    const entry = entries.get(node);
    if (!entry || !node.isConnected) return [];
    const { top, bottom } = node.getBoundingClientRect();
    return [{ id: node, top, bottom, playable: entry.playable }];
  });
  const { active, preload } = document.hidden ? { active: null, preload: null } : chooseFeedPlayback(bounds, viewport, manuallySelected);
  if (manuallySelected && active !== manuallySelected) manuallySelected = null;
  const near = new Set(bounds.filter((item) => item.bottom > viewport.top && item.top < viewport.bottom + 400).map((item) => item.id));
  entries.forEach((entry, node) => {
    const next = { near: near.has(node), active: active === node, preload: preload === node };
    if (next.near !== entry.visibility.near || next.active !== entry.visibility.active || next.preload !== entry.visibility.preload) {
      entry.visibility = next;
      entry.update(next);
    }
  });
}

function scheduleMeasure() {
  if (requestedFrame) return;
  requestedFrame = window.requestAnimationFrame(() => {
    requestedFrame = 0;
    measure();
  });
}

function handleVisibilityChange() {
  if (document.hidden) measure();
  else scheduleMeasure();
}

function connect() {
  if ('IntersectionObserver' in window) {
    intersect = new IntersectionObserver((events) => {
      for (const { target, isIntersecting } of events) {
        const node = target as HTMLElement;
        if (!entries.has(node)) continue;
        if (isIntersecting) nearby.add(node);
        else nearby.delete(node);
      }
      scheduleMeasure();
    }, { rootMargin: '480px 0px' });
  }
  window.addEventListener('scroll', scheduleMeasure, { passive: true, capture: true });
  window.addEventListener('resize', scheduleMeasure, { passive: true });
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

function register(node: HTMLElement, entry: Entry) {
  if (!entries.size) connect();
  entries.set(node, entry);
  if (intersect) intersect.observe(node);
  else nearby.add(node);
  scheduleMeasure();

  return () => {
    intersect?.unobserve(node);
    entries.delete(node);
    nearby.delete(node);
    if (manuallySelected === node) manuallySelected = null;
    if (entries.size) scheduleMeasure();
    else {
      window.removeEventListener('scroll', scheduleMeasure, true);
      window.removeEventListener('resize', scheduleMeasure);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      intersect?.disconnect();
      intersect = null;
      window.cancelAnimationFrame(requestedFrame);
      requestedFrame = 0;
    }
  };
}

export function useFeedMediaViewport(enabled: boolean, playable: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const entry = useRef<Entry | null>(null);
  const [visibility, setVisibility] = useState<Visibility>(offscreen);

  useEffect(() => {
    if (!enabled || !ref.current) return;
    const subscription: Entry = { playable: false, visibility: offscreen, update: setVisibility };
    entry.current = subscription;
    setVisibility(offscreen);
    const unregister = register(ref.current, subscription);
    return () => { entry.current = null; unregister(); };
  }, [enabled]);

  useEffect(() => {
    if (!entry.current) return;
    entry.current.playable = playable;
    scheduleMeasure();
  }, [enabled, playable]);

  const requestPlayback = useCallback(() => {
    if (!ref.current) return;
    manuallySelected = ref.current;
    manualScrollPosition = window.scrollY;
    // A manual tap can precede the IntersectionObserver's first notification.
    if (entries.has(ref.current)) nearby.add(ref.current);
    measure();
  }, []);

  return { ref, visibility, requestPlayback };
}
