import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { testModules } from './helpers/load-typescript.mjs';

function renderPlanner({ destination = true, permitted = false, route = null, demo = false, message = 'Sign in to plan your trip.' } = {}) {
  let state = 0;
  const supplied = { 2: route, 3: demo, 8: permitted, 9: false, 10: message };
  const hooks = { ...React, useEffect() {}, useId: () => 'journey-view-test',
    useState: value => [Object.hasOwn(supplied, state) ? supplied[state++] : (state++, value), () => {}],
    useMemo: callback => callback(), useRef: value => ({ current: value }) };
  const { CampusJourneyPlanner } = testModules({
    react: hooks,
    '@/lib/supabase/client': { supabase: {} },
    '@/components/ui/button': { Button: ({ children, asChild, ...props }) => asChild ? children :
      React.createElement('button', { disabled: props.disabled, type: 'button' }, children) },
    './journey-diagram': {
      JourneyDiagram: () => React.createElement('div', null, 'route-diagram-test'),
      journeyIcons: Object.fromEntries(['walk', 'bike', 'motor', 'car'].map(key => [key, () => React.createElement('span', null, key)])),
    },
  })('components/campus-mate/campus-journey-planner.tsx');
  return renderToStaticMarkup(CampusJourneyPlanner({
    destination: destination ? { id: 'pharmacy', name: 'O. K Pharmacy', position: { latitude: 7.34, longitude: -2.33 } } : null,
    startingPlaces: [], deviceLocation: { latitude: 7.345, longitude: -2.334 }, locating: false,
    onLocate() {}, locationMessage: '', onClear() {}, mapFallback: null, enabled: permitted,
  }));
}

test('a real destination never shows the sample animation as its route', () => {
  const page = renderPlanner({ demo: true });
  assert.match(page, /Your route to O\. K Pharmacy/);
  assert.match(page, /Sign in to plan your trip/);
  assert.match(page, /Recheck route access/);
  assert.match(page, /Google Maps/);
  assert.doesNotMatch(page, /route-diagram-test|Try animation|Play preview|Preview route/);
});

test('authorized planners show a starting point and a real-route action', () => {
  const page = renderPlanner({ permitted: true });
  assert.match(page, /Starting point/);
  assert.match(page, /Preview route/);
  assert.doesNotMatch(page, /Try animation|route-diagram-test/);
});

test('calculated routes expose distance, estimated time and expanded real instructions', () => {
  const page = renderPlanner({ permitted: true, route: {
    shape: [{ latitude: 7.345, longitude: -2.334 }, { latitude: 7.34, longitude: -2.33 }],
    metres: 711, seconds: 510, steps: [{ instruction: 'Walk south on the public footpath', metres: 711 }],
  } });
  assert.match(page, /route-diagram-test/);
  assert.match(page, /711 m/);
  assert.match(page, /<details open=""/);
  assert.match(page, /Walk south on the public footpath/);
  assert.doesNotMatch(page, /Try animation/);
});
