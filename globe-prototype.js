const EARTH_RADIUS = 6378137;
const ROUTE_DISTANCE_METERS = 20000000;
const DEMO_POSITION = [40.2506, 18.2794]; // Calimera [lat, lon]
const AIMING_ZOOM = 16;

const statusEl = document.getElementById('prototypeStatus');
const targetEl = document.getElementById('prototypeTarget');
const errorEl = document.getElementById('prototypeError');
const bearingInput = document.getElementById('bearingInput');
const bearingValue = document.getElementById('bearingValue');
const locateBtn = document.getElementById('locateBtn');
const randomTargetBtn = document.getElementById('randomTargetBtn');
const showLineBtn = document.getElementById('showPrototypeLineBtn');
const resetBtn = document.getElementById('resetPrototypeBtn');
const distanceInputWrap = document.getElementById('distanceInputWrap');
const distanceInput = document.getElementById('distanceInput');
const compassEl = document.getElementById('prototypeCompass');
const compassNeedle = document.getElementById('prototypeCompassNeedle');
const modeButtons = Array.from(document.querySelectorAll('[data-mode]'));

let playerLatLng = DEMO_POSITION;
let targetLatLng = null;
let targetLabel = '';
let heading = 0;
let gameMode = 'medium';
let lineRevealed = false;
let mapReady = false;
let playerMarker = null;
let targetMarker = null;
let orientationStarted = false;
let lastAbsoluteOrientationAt = 0;
let smoothHeading = null;
let pendingHeading = null;
let orientationFrameId = null;

const emptyCollection = () => ({ type: 'FeatureCollection', features: [] });

const map = new maplibregl.Map({
  container: 'globeMap',
  attributionControl: false,
  renderWorldCopies: false,
  style: {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Tiles © Esri'
      }
    },
    layers: [
      { id: 'space', type: 'background', paint: { 'background-color': '#020712' } },
      { id: 'satellite', type: 'raster', source: 'satellite' }
    ]
  },
  center: [DEMO_POSITION[1], DEMO_POSITION[0]],
  zoom: AIMING_ZOOM,
  minZoom: 0,
  maxZoom: 20,
  pitch: 0,
  bearing: 0,
  maxPitch: 0,
  dragRotate: false,
  pitchWithRotate: false,
  touchZoomRotate: true
});

map.on('load', () => {
  map.setProjection({ type: 'globe' });
  map.addSource('prototype-route', { type: 'geojson', data: emptyCollection() });
  map.addSource('prototype-error', { type: 'geojson', data: emptyCollection() });

  map.addLayer({
    id: 'prototype-route-shadow',
    type: 'line',
    source: 'prototype-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': 'rgba(0,0,0,.72)', 'line-width': 6 }
  });
  map.addLayer({
    id: 'prototype-route',
    type: 'line',
    source: 'prototype-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#e41a1c', 'line-width': 3.5 }
  });
  map.addLayer({
    id: 'prototype-error',
    type: 'line',
    source: 'prototype-error',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#facf0a', 'line-width': 3.5 }
  });

  mapReady = true;
  if (typeof map.touchZoomRotate.disableRotation === 'function') {
    map.touchZoomRotate.disableRotation();
  }
  updatePlayerMarker();
  chooseRandomTarget();
});

function normalizeHeading(value) {
  return (value % 360 + 360) % 360;
}

function normalizeLongitude(value) {
  return ((value + 540) % 360) - 180;
}

function destLatLng(lat, lon, bearingDeg, distanceMeters) {
  const bearing = bearingDeg * Math.PI / 180;
  const lat1 = lat * Math.PI / 180;
  const lon1 = lon * Math.PI / 180;
  const angularDistance = distanceMeters / EARTH_RADIUS;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );
  return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
}

function greatCirclePoints(lat, lon, bearing, distanceMeters, steps = 400) {
  const points = [];
  for (let index = 0; index <= steps; index++) {
    const fraction = index / steps;
    points.push(destLatLng(lat, lon, bearing, distanceMeters * fraction));
  }
  return points;
}

function toUnitVector([lat, lon]) {
  const phi = lat * Math.PI / 180;
  const lambda = lon * Math.PI / 180;
  const cosPhi = Math.cos(phi);
  return [cosPhi * Math.cos(lambda), cosPhi * Math.sin(lambda), Math.sin(phi)];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function normalizeVector(vector) {
  const length = Math.hypot(...vector);
  return length < 1e-12 ? null : vector.map(value => value / length);
}

function angleBetween(a, b) {
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
}

function vectorToLatLng(vector) {
  return [
    Math.atan2(vector[2], Math.hypot(vector[0], vector[1])) * 180 / Math.PI,
    Math.atan2(vector[1], vector[0]) * 180 / Math.PI
  ];
}

function nearestPointOnLine(point, linePoints) {
  const targetVector = toUnitVector(point);
  let bestVector = null;
  let bestAngle = Infinity;

  const consider = candidate => {
    const candidateAngle = angleBetween(targetVector, candidate);
    if (candidateAngle < bestAngle) {
      bestAngle = candidateAngle;
      bestVector = candidate;
    }
  };

  for (let index = 0; index < linePoints.length - 1; index++) {
    const start = toUnitVector(linePoints[index]);
    const end = toUnitVector(linePoints[index + 1]);
    consider(start);
    consider(end);

    const normal = normalizeVector(cross(start, end));
    if (!normal) continue;
    const projected = normalizeVector([
      targetVector[0] - normal[0] * dot(targetVector, normal),
      targetVector[1] - normal[1] * dot(targetVector, normal),
      targetVector[2] - normal[2] * dot(targetVector, normal)
    ]);
    if (!projected) continue;

    const candidate = dot(targetVector, projected) >= 0
      ? projected
      : projected.map(value => -value);
    const segmentAngle = angleBetween(start, end);
    const isOnSegment = Math.abs(
      angleBetween(start, candidate) + angleBetween(candidate, end) - segmentAngle
    ) < 1e-7;
    if (isOnSegment) consider(candidate);
  }

  return {
    point: vectorToLatLng(bestVector),
    distance: bestAngle * EARTH_RADIUS
  };
}

function greatCircleArcBetween(from, to) {
  const start = toUnitVector(from);
  const end = toUnitVector(to);
  const omega = angleBetween(start, end);
  const sinOmega = Math.sin(omega);
  if (omega < 1e-10 || Math.abs(sinOmega) < 1e-10) return [from, to];

  const steps = Math.min(180, Math.max(20, Math.ceil(omega * 180 / Math.PI * 2)));
  const points = [];
  for (let index = 0; index <= steps; index++) {
    const fraction = index / steps;
    const startWeight = Math.sin((1 - fraction) * omega) / sinOmega;
    const endWeight = Math.sin(fraction * omega) / sinOmega;
    const vector = normalizeVector([
      startWeight * start[0] + endWeight * end[0],
      startWeight * start[1] + endWeight * end[1],
      startWeight * start[2] + endWeight * end[2]
    ]);
    const latLng = vectorToLatLng(vector);
    if (points.length) {
      const previousLon = points[points.length - 1][1];
      while (latLng[1] - previousLon > 180) latLng[1] -= 360;
      while (latLng[1] - previousLon < -180) latLng[1] += 360;
    }
    points.push(latLng);
  }
  return points;
}

function lineFeature(points) {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: points.map(([lat, lon]) => [lon, lat])
      }
    }]
  };
}

function markerElement(type) {
  const element = document.createElement('div');
  element.className = `globe-marker ${type}`;
  return element;
}

function updatePlayerMarker() {
  if (!mapReady) return;
  const lngLat = [normalizeLongitude(playerLatLng[1]), playerLatLng[0]];
  if (!playerMarker) {
    playerMarker = new maplibregl.Marker({ element: markerElement('player'), anchor: 'center' })
      .setLngLat(lngLat)
      .addTo(map);
  } else {
    playerMarker.setLngLat(lngLat);
  }
}

function updateTargetMarker() {
  if (!mapReady || !targetLatLng) return;
  const lngLat = [normalizeLongitude(targetLatLng[1]), targetLatLng[0]];
  if (!targetMarker) {
    targetMarker = new maplibregl.Marker({ element: markerElement('target'), anchor: 'center' })
      .setLngLat(lngLat)
      .addTo(map);
  } else {
    targetMarker.setLngLat(lngLat);
  }
}

function removeTargetMarker() {
  if (!targetMarker) return;
  targetMarker.remove();
  targetMarker = null;
}

function setMapInteraction(enabled) {
  const handlers = [
    map.dragPan,
    map.scrollZoom,
    map.boxZoom,
    map.doubleClickZoom,
    map.keyboard,
    map.touchZoomRotate
  ];
  for (const handler of handlers) {
    if (!handler) continue;
    if (enabled) handler.enable();
    else handler.disable();
  }
  if (enabled && typeof map.touchZoomRotate.disableRotation === 'function') {
    map.touchZoomRotate.disableRotation();
  }
}

function weightedRandom(items) {
  const total = items.reduce((sum, item) => sum + (item.weight || 1), 0);
  let choice = Math.random() * total;
  for (const item of items) {
    choice -= item.weight || 1;
    if (choice <= 0) return item;
  }
  return items[items.length - 1];
}

function sphericalMidpoint(first, second) {
  const a = toUnitVector(first);
  const b = toUnitVector(second);
  const midpoint = normalizeVector([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
  return midpoint ? vectorToLatLng(midpoint) : first;
}

function clearLines() {
  if (!mapReady) return;
  map.getSource('prototype-route').setData(emptyCollection());
  map.getSource('prototype-error').setData(emptyCollection());
  errorEl.textContent = '';
}

function frameAimingView(animated = true) {
  if (!mapReady) return;
  map.stop();
  const camera = {
    center: [normalizeLongitude(playerLatLng[1]), playerLatLng[0]],
    zoom: AIMING_ZOOM,
    pitch: 0,
    bearing: normalizeHeading(360 - heading),
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    retainPadding: false,
    duration: animated ? 650 : 0
  };
  if (animated) map.easeTo(camera);
  else map.jumpTo(camera);
}

function sphericalCenter(points) {
  const sum = points.reduce((result, point) => {
    const vector = toUnitVector(point);
    return result.map((value, index) => value + vector[index]);
  }, [0, 0, 0]);
  const center = normalizeVector(sum);
  if (center) return vectorToLatLng(center);
  return sphericalMidpoint(points[0], points[1]) || points[0];
}

function frameResult(points) {
  if (!mapReady || !points.length) return;
  const center = sphericalCenter(points);
  const centerVector = toUnitVector(center);
  const angularRadius = Math.max(
    0.015,
    ...points.map(point => angleBetween(centerVector, toUnitVector(point)))
  );
  const panelHeight = document.querySelector('.prototype-panel')?.getBoundingClientRect().height || 0;
  const topPadding = Math.min(panelHeight + 24, map.getContainer().clientHeight * 0.48);
  const padding = { top: topPadding, right: 28, bottom: 92, left: 28 };
  const availableWidth = Math.max(160, map.getContainer().clientWidth - padding.left - padding.right);
  const availableHeight = Math.max(160, map.getContainer().clientHeight - padding.top - padding.bottom);
  const availableSize = Math.min(availableWidth, availableHeight);
  const zoom = Math.max(0, Math.min(7, Math.log2(
    availableSize * Math.PI / (512 * angularRadius * 1.35)
  )));

  map.stop();
  map.easeTo({
    center: [normalizeLongitude(center[1]), center[0]],
    zoom,
    pitch: 0,
    bearing: 0,
    padding,
    retainPadding: false,
    duration: 800
  });
}

function chooseRandomTarget() {
  const catalogue = Array.isArray(window.BUSSOLE_TARGETS) ? window.BUSSOLE_TARGETS : [];
  if (!catalogue.length) {
    statusEl.textContent = 'The Random target catalogue could not be loaded.';
    return;
  }
  const target = weightedRandom(catalogue);
  targetLatLng = [target.lat, target.lon];
  targetLabel = target.country ? `${target.name}, ${target.country}` : target.name;
  targetEl.textContent = targetLabel;
  clearLines();
  removeTargetMarker();
  lineRevealed = false;
  setMapInteraction(false);
  frameAimingView();
  statusEl.textContent = 'Target ready. Aim with your phone or adjust the bearing slider.';
}

function showPrototypeLine() {
  if (!mapReady || !targetLatLng) return;
  let distanceMeters = ROUTE_DISTANCE_METERS;
  if (gameMode === 'hard') {
    const distanceKm = Number.parseFloat(distanceInput.value);
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      statusEl.textContent = 'Enter a valid distance for Hard mode.';
      distanceInput.focus();
      return;
    }
    distanceMeters = distanceKm * 1000;
  }
  const route = greatCirclePoints(
    playerLatLng[0],
    playerLatLng[1],
    heading,
    distanceMeters
  );
  const errorOrigin = gameMode === 'hard'
    ? route[route.length - 1]
    : nearestPointOnLine(targetLatLng, route).point;
  const errorMeters = angleBetween(toUnitVector(errorOrigin), toUnitVector(targetLatLng)) * EARTH_RADIUS;
  const errorArc = greatCircleArcBetween(errorOrigin, targetLatLng);

  map.getSource('prototype-route').setData(lineFeature(route));
  map.getSource('prototype-error').setData(lineFeature(errorArc));
  errorEl.textContent = `Error: ${(errorMeters / 1000).toFixed(1)} km`;
  statusEl.textContent = `Line locked at ${Math.round(heading)}°. Drag the globe to inspect it.`;
  lineRevealed = true;
  updateTargetMarker();
  setMapInteraction(true);
  frameResult([playerLatLng, targetLatLng, errorOrigin]);
}

function resetPrototype() {
  clearLines();
  removeTargetMarker();
  lineRevealed = false;
  setMapInteraction(false);
  frameAimingView();
  statusEl.textContent = 'Aiming view restored. The target is unchanged.';
}

function updateBearing(value, rotateMap = false) {
  heading = normalizeHeading(Number(value) || 0);
  bearingInput.value = String(Math.round(heading));
  bearingValue.value = `${Math.round(heading)}°`;
  compassNeedle.style.transform = `translate(-50%, -50%) rotate(${-heading}deg)`;
  if (rotateMap && mapReady && !lineRevealed) {
    map.setBearing(normalizeHeading(360 - heading));
  }
}

function screenOrientationAngle() {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  return typeof window.orientation === 'number' ? window.orientation : 0;
}

function smoothAngle(previous, next, amount) {
  if (previous === null) return next;
  const previousRadians = previous * Math.PI / 180;
  const nextRadians = next * Math.PI / 180;
  const x = (1 - amount) * Math.cos(previousRadians) + amount * Math.cos(nextRadians);
  const y = (1 - amount) * Math.sin(previousRadians) + amount * Math.sin(nextRadians);
  return normalizeHeading(Math.atan2(y, x) * 180 / Math.PI);
}

function angularDistanceDegrees(first, second) {
  return Math.abs(((second - first + 540) % 360) - 180);
}

function tiltCompensatedHeading(alpha, beta, gamma) {
  if (typeof alpha !== 'number') return null;
  if (typeof beta !== 'number' || typeof gamma !== 'number' ||
      (Math.abs(beta) < .5 && Math.abs(gamma) < .5)) {
    return normalizeHeading(360 - alpha);
  }
  const radians = Math.PI / 180;
  const x = beta * radians;
  const y = gamma * radians;
  const z = alpha * radians;
  const cX = Math.cos(x);
  const cY = Math.cos(y);
  const cZ = Math.cos(z);
  const sX = Math.sin(x);
  const sY = Math.sin(y);
  const sZ = Math.sin(z);
  const vectorX = -cZ * sY - sZ * sX * cY;
  const vectorY = -sZ * sY + cZ * sX * cY;
  return normalizeHeading(Math.atan2(vectorX, vectorY) * 180 / Math.PI);
}

function applyOrientationFrame() {
  orientationFrameId = null;
  if (pendingHeading === null) return;
  updateBearing(pendingHeading, true);
}

function handleOrientation(event) {
  let nextHeading = null;
  if (typeof event.webkitCompassHeading === 'number') {
    nextHeading = event.webkitCompassHeading;
  } else if (typeof event.alpha === 'number') {
    nextHeading = tiltCompensatedHeading(event.alpha, event.beta, event.gamma);
  }
  if (!Number.isFinite(nextHeading)) return;
  nextHeading = normalizeHeading(nextHeading + screenOrientationAngle());
  const change = smoothHeading === null ? 180 : angularDistanceDegrees(smoothHeading, nextHeading);
  const smoothing = change > 45 ? .65 : change > 15 ? .38 : .16;
  smoothHeading = smoothAngle(smoothHeading, nextHeading, smoothing);
  pendingHeading = smoothHeading;
  if (orientationFrameId === null) orientationFrameId = requestAnimationFrame(applyOrientationFrame);
}

function handleAbsoluteOrientation(event) {
  if (typeof event.webkitCompassHeading !== 'number' && typeof event.alpha !== 'number') return;
  lastAbsoluteOrientationAt = performance.now();
  handleOrientation(event);
}

function handleFallbackOrientation(event) {
  if (performance.now() - lastAbsoluteOrientationAt < 1000) return;
  handleOrientation(event);
}

async function startOrientation() {
  if (orientationStarted) return true;
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    const permission = await DeviceOrientationEvent.requestPermission();
    if (permission !== 'granted') return false;
  }
  window.addEventListener('deviceorientationabsolute', handleAbsoluteOrientation, true);
  window.addEventListener('deviceorientation', handleFallbackOrientation, true);
  orientationStarted = true;
  return true;
}

async function useMyLocation() {
  locateBtn.disabled = true;
  statusEl.textContent = 'Requesting location and compass access…';
  try {
    await startOrientation().catch(() => false);
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000
      });
    });
    playerLatLng = [position.coords.latitude, position.coords.longitude];
    updatePlayerMarker();
    resetPrototype();
    statusEl.textContent = 'Your position is active. Aim with the phone or use the slider.';
    locateBtn.textContent = 'Location active';
  } catch (error) {
    statusEl.textContent = `Location unavailable: ${error.message || 'permission denied'}. Using Calimera for the demo.`;
  } finally {
    locateBtn.disabled = false;
  }
}

function setMode(mode) {
  gameMode = mode;
  for (const button of modeButtons) {
    const selected = button.dataset.mode === mode;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  distanceInputWrap.classList.toggle('hidden', mode !== 'hard');
  compassEl.classList.toggle('hidden', mode !== 'easy');
  if (mapReady) {
    resetPrototype();
    statusEl.textContent = `${mode[0].toUpperCase()}${mode.slice(1)} mode ready. The target is unchanged.`;
  }
}

bearingInput.addEventListener('input', event => updateBearing(event.target.value, true));
locateBtn.addEventListener('click', useMyLocation);
randomTargetBtn.addEventListener('click', chooseRandomTarget);
showLineBtn.addEventListener('click', showPrototypeLine);
resetBtn.addEventListener('click', resetPrototype);
modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
setMode('medium');
updateBearing(0);
