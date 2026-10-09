const EARTH_RADIUS = 6378137;
const ROUTE_DISTANCE_METERS = 20000000;
const DEMO_POSITION = [40.2506, 18.2794]; // Calimera [lat, lon]

const statusEl = document.getElementById('prototypeStatus');
const targetEl = document.getElementById('prototypeTarget');
const errorEl = document.getElementById('prototypeError');
const bearingInput = document.getElementById('bearingInput');
const bearingValue = document.getElementById('bearingValue');
const locateBtn = document.getElementById('locateBtn');
const randomTargetBtn = document.getElementById('randomTargetBtn');
const showLineBtn = document.getElementById('showPrototypeLineBtn');
const resetBtn = document.getElementById('resetPrototypeBtn');

let playerLatLng = DEMO_POSITION;
let targetLatLng = null;
let targetLabel = '';
let heading = 0;
let mapReady = false;
let playerMarker = null;
let targetMarker = null;
let orientationStarted = false;

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
  center: [14, 26],
  zoom: 1.15,
  pitch: 0,
  bearing: 0,
  maxPitch: 60,
  dragRotate: true,
  pitchWithRotate: true,
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
    paint: { 'line-color': '#ff8587', 'line-width': 3.5, 'line-dasharray': [2, 1.3] }
  });

  mapReady = true;
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

function framePlayerAndTarget() {
  if (!mapReady || !targetLatLng) return;
  const midpoint = sphericalMidpoint(playerLatLng, targetLatLng);
  map.easeTo({
    center: [normalizeLongitude(midpoint[1]), midpoint[0]],
    zoom: .75,
    pitch: 0,
    bearing: 0,
    duration: 850
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
  updateTargetMarker();
  framePlayerAndTarget();
  statusEl.textContent = 'Target ready. Aim with your phone or adjust the bearing slider.';
}

function showPrototypeLine() {
  if (!mapReady || !targetLatLng) return;
  const route = greatCirclePoints(
    playerLatLng[0],
    playerLatLng[1],
    heading,
    ROUTE_DISTANCE_METERS
  );
  const nearest = nearestPointOnLine(targetLatLng, route);
  const errorArc = greatCircleArcBetween(nearest.point, targetLatLng);

  map.getSource('prototype-route').setData(lineFeature(route));
  map.getSource('prototype-error').setData(lineFeature(errorArc));
  errorEl.textContent = `Error: ${(nearest.distance / 1000).toFixed(1)} km`;
  statusEl.textContent = `Line locked at ${Math.round(heading)}°. Drag the globe to inspect it.`;
  framePlayerAndTarget();
}

function resetPrototype() {
  clearLines();
  map.easeTo({
    center: [normalizeLongitude(playerLatLng[1]), playerLatLng[0]],
    zoom: 3.2,
    pitch: 0,
    bearing: normalizeHeading(360 - heading),
    duration: 700
  });
  statusEl.textContent = 'Aiming view restored. The target is unchanged.';
}

function updateBearing(value, rotateMap = false) {
  heading = normalizeHeading(Number(value) || 0);
  bearingInput.value = String(Math.round(heading));
  bearingValue.value = `${Math.round(heading)}°`;
  if (rotateMap && mapReady && map.getZoom() > 1.4) {
    map.setBearing(normalizeHeading(360 - heading));
  }
}

function screenOrientationAngle() {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  return typeof window.orientation === 'number' ? window.orientation : 0;
}

function handleOrientation(event) {
  let nextHeading = null;
  if (typeof event.webkitCompassHeading === 'number') {
    nextHeading = event.webkitCompassHeading;
  } else if (typeof event.alpha === 'number' && event.absolute) {
    nextHeading = 360 - event.alpha;
  }
  if (!Number.isFinite(nextHeading)) return;
  updateBearing(nextHeading + screenOrientationAngle(), true);
}

async function startOrientation() {
  if (orientationStarted) return true;
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    const permission = await DeviceOrientationEvent.requestPermission();
    if (permission !== 'granted') return false;
  }
  window.addEventListener('deviceorientationabsolute', handleOrientation, true);
  window.addEventListener('deviceorientation', handleOrientation, true);
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

bearingInput.addEventListener('input', event => updateBearing(event.target.value, true));
locateBtn.addEventListener('click', useMyLocation);
randomTargetBtn.addEventListener('click', chooseRandomTarget);
showLineBtn.addEventListener('click', showPrototypeLine);
resetBtn.addEventListener('click', resetPrototype);
updateBearing(0);
