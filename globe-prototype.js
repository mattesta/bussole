const EARTH_RADIUS = 6378137;
const ROUTE_DISTANCE_METERS = 20000000;
const DEMO_POSITION = [40.2506, 18.2794]; // Calimera [lat, lon]
const AIMING_ZOOM = 16;
// Native drag inertia keeps touch/pinch handling and horizon constraints in
// MapLibre. A lower deceleration gives a short, soft coast after a flick.
const GLOBE_DRAG_INERTIA = { linearity: 0.4, maxSpeed: 1400, deceleration: 1200 };
const pageParameters = new URLSearchParams(window.location.search);
if(pageParameters.get('solo')==='daily'){pageParameters.set('mode','medium');pageParameters.set('timer','30');pageParameters.set('blur','1');}
const integratedMode = pageParameters.get('integrated') === '1';
const multiplayerMode = pageParameters.get('multiplayer') === '1';
const soloGameMode = !multiplayerMode && ['game','daily'].includes(pageParameters.get('solo'));
if (soloGameMode) document.body.classList.add('solo-game');
let soloController = null;
const debugMode = pageParameters.get('debug') === '1';
let blurEnabled = !multiplayerMode && pageParameters.get('blur') === '1';
const soloTimerSeconds = !multiplayerMode && window.BussoleRoundTimer.validDuration(pageParameters.get('timer'))
  ? Number(pageParameters.get('timer')) : 0;
let soloTimerActive = false;
const soloCountdown = window.BussoleRoundTimer.create(
  document.getElementById('globeCountdown'), document.querySelector('.target-card'), () => Date.now(),
  () => { if (soloGameMode) soloController?.expire(); else showPrototypeLine(); }, element => window.BussoleMobileLayout.positionTimer(element)
);
function stopSoloTimer() {
  soloTimerActive = false;
  soloCountdown.stop();
}

const requestedMode = ['easy', 'medium', 'hard'].includes(pageParameters.get('mode'))
  ? pageParameters.get('mode')
  : 'medium';

function readLaunchData() {
  try {
    const value = sessionStorage.getItem('bussoleGlobeLaunch');
    // A multiplayer room returns to the lobby between rounds and then loads
    // this page again. Keep the permission/location hand-off for those later
    // rounds; a new game session will overwrite it from the multiplayer tap.
    if (!multiplayerMode) sessionStorage.removeItem('bussoleGlobeLaunch');
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

const launchData = integratedMode ? readLaunchData() : null;
const launchCoordinates = launchData?.coordinates;
const hasLaunchCoordinates = Number.isFinite(launchCoordinates?.latitude) &&
  Number.isFinite(launchCoordinates?.longitude);

const statusEl = document.getElementById('prototypeStatus');
const targetEl = document.getElementById('prototypeTarget');
const errorEl = document.getElementById('prototypeError');
const bearingInput = document.getElementById('bearingInput');
const bearingValue = document.getElementById('bearingValue');
const randomTargetBtn = document.getElementById('randomTargetBtn');
const showLineBtn = document.getElementById('showPrototypeLineBtn');
const resetBtn = document.getElementById('resetPrototypeBtn');
const distanceInputWrap = document.getElementById('distanceInputWrap');
const distanceInput = document.getElementById('distanceInput');
window.BussoleDistanceInput?.attach(distanceInput);
const compassEl = document.getElementById('prototypeCompass');
const compassNeedle = document.getElementById('prototypeCompassNeedle');
const bearingControl = document.querySelector('.bearing-control');
const searchPanel = document.getElementById('globeSearchPanel');
const openSearchBtn = document.getElementById('openGlobeSearchBtn');
const searchCloseBtn = document.getElementById('globeSearchClose');
const searchBtn = document.getElementById('globeSearchBtn');
const searchBox = document.getElementById('globeSearchBox');
const clearSearchBtn = document.getElementById('globeClearSearch');
const suggestionsEl = document.getElementById('globeSuggestions');
const accessPanel = document.getElementById('globeAccessPanel');
const accessMessage = document.getElementById('globeAccessMessage');
const accessRetry = document.getElementById('globeAccessRetry');
// Saved coordinates frame the initial view; a fresh browser check enables Go.
let locationReady = false;
let locationError = null;
let locationRequest = null;
let accessRequest = null;
let accessBusy = false;
let automaticAccessCheck = true;
let orientationPermissionGranted = Boolean(launchData?.orientationGranted);

let playerLatLng = hasLaunchCoordinates
  ? [launchCoordinates.latitude, launchCoordinates.longitude]
  : DEMO_POSITION;
let targetLatLng = null;
let targetLabel = '';
let heading = 0;
let gameMode = 'medium';
let lineRevealed = false;
let mapReady = false;
let playerMarker = null;
let targetMarker = null;
let orientationStarted = false;
let compassUsable = false;
let compassSubmitted = false;
let compassWarning = null;
let compassTracker = null;
let manualBearing = false;
let smoothHeading = null;
let pendingHeading = null;
let orientationFrameId = null;
let searchTimeout = null;
let multiplayerController = null;
let multiplayerLayerIds = [];
const usedRandomTargets = new Set();
let lastRandomTargetKey = null;

document.body.classList.toggle('globe-multiplayer', multiplayerMode);

bearingControl.classList.toggle(
  'hidden',
  integratedMode && launchData?.orientationGranted && !debugMode
);

const globeLines = window.BussoleGlobeLines.createLayer();

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
  center: [playerLatLng[1], playerLatLng[0]],
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

window.BussoleGlobeMarkerSync.attach(map, () => [playerMarker, targetMarker]);

const playerBlur = window.BussolePlayerBlur.create(
  document.getElementById('globeMap'), point => map.project([point[1], point[0]]), destLatLng
);
function updatePlayerBlur() {
  if (blurEnabled && mapReady && !lineRevealed) playerBlur.show(...playerLatLng);
  else playerBlur.hide();
}
map.on('move', updatePlayerBlur);
map.on('zoom', updatePlayerBlur);

map.on('click', () => { multiplayerController?.dismissResults?.(); soloController?.dismissResults?.(); });

map.getCanvas().addEventListener('pointerdown', () => {
  if (lineRevealed) map.stop();
}, { passive: true });

map.on('load', () => {
  map.setProjection({ type: 'globe' });
  map.addLayer(globeLines);

  mapReady = true;
  setMapInteraction(false);
  updatePlayerMarker();
  frameAimingView(false);
  // Geolocation may prompt without a tap. iOS motion permission may not:
  // missing motion access is recovered with the visible user-gesture button.
  refreshPlayerLocation();
  if (orientationPermissionGranted || (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function')) {
    startOrientation(orientationPermissionGranted).catch(() => handleCompassStatus('unavailable'));
  }
  updateGoButtonState();
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

function greatCirclePoints(lat, lon, bearing, distanceMeters, steps = Math.min(20000, Math.max(400, Math.ceil(Math.abs(distanceMeters) / 25000)))) {
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

function markerElement(type) {
  const element = document.createElement('div');
  element.className = `globe-marker ${type}`;
  return element;
}

function updatePlayerMarker() {
  updatePlayerBlur();
  if (!mapReady) return;
  const lngLat = [normalizeLongitude(playerLatLng[1]), playerLatLng[0]];
  if (!playerMarker) {
    playerMarker = new maplibregl.Marker({ element: markerElement('player'), anchor: 'center', subpixelPositioning: true })
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
    targetMarker = new maplibregl.Marker({ element: markerElement('target'), anchor: 'center', subpixelPositioning: true })
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
  if (!enabled) map.stop();
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
    if (enabled) handler.enable(handler === map.dragPan ? GLOBE_DRAG_INERTIA : undefined);
    else handler.disable();
  }
  // Aim follows the phone compass. After reveal, allow pinch/twist inspection.
  if (enabled) map.touchZoomRotate.enableRotation();
  else map.touchZoomRotate.disableRotation();
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

function targetKey(target) {
  return `${target.name}|${target.lat}|${target.lon}`;
}

function setRandomButtonState(isRandomTarget) {
  randomTargetBtn.textContent = isRandomTarget ? 'Next Target' : 'Random Target';
  randomTargetBtn.setAttribute(
    'aria-label',
    isRandomTarget ? 'Choose the next random target' : 'Choose a random target'
  );
}

function updateGoButtonState() {
  updateAccessPanel();
  showLineBtn.disabled = Boolean(!locationReady || !mapReady || !targetLatLng || lineRevealed || compassSubmitted || (!compassUsable && !manualBearing) || (soloGameMode && !soloController?.canAim()));
  if (soloTimerSeconds && !soloTimerActive && !showLineBtn.disabled) {
    soloTimerActive = true;
    soloCountdown.sync({ phase: 'aiming', deadline: Date.now() + soloTimerSeconds * 1000 });
  }
}

function setTarget(lat, lon, label, isRandomTarget = false) {
  if (!multiplayerMode) window.dispatchEvent(new CustomEvent('bussole-solo-start'));
  if (!multiplayerMode) stopSoloTimer();
  targetLatLng = [lat, lon];
  targetLabel = label;
  targetEl.textContent = label;
  searchBox.value = label;
  updateClearSearchButton();
  clearLines();
  removeTargetMarker();
  lineRevealed = false;
  setRandomButtonState(isRandomTarget);
  setMapInteraction(false);
  frameAimingView(false);
  statusEl.textContent = 'Target ready. Aim with your phone or use the bearing slider.';
  updateGoButtonState();
}

function sphericalMidpoint(first, second) {
  const a = toUnitVector(first);
  const b = toUnitVector(second);
  const midpoint = normalizeVector([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
  return midpoint ? vectorToLatLng(midpoint) : first;
}

function clearLines() {
  if (!mapReady) return;
  globeLines.removeLine('prototype-route');
  globeLines.removeLine('prototype-error');
  errorEl.textContent = '';
}

function clearMultiplayerLayers() {
  if (!mapReady) return;
  multiplayerLayerIds.forEach(id => globeLines.removeLine(id));
  multiplayerLayerIds = [];
}

function addMultiplayerLine(id, points, color, width, withShadow = false) {
  globeLines.setLine(id, points, color, width, withShadow);
  multiplayerLayerIds.push(id);
}

function frameAimingView(animated = true) {
  if (!mapReady) return;
  map.stop();
  const camera = {
    center: [normalizeLongitude(playerLatLng[1]), playerLatLng[0]],
    zoom: AIMING_ZOOM,
    pitch: 0,
    // MapLibre uses the direction at the top of the screen as its bearing.
    bearing: heading,
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
  const targetBottom = document.querySelector('.target-card')?.getBoundingClientRect().bottom || 0;
  const controlsHeight = document.querySelector('.game-controls')?.getBoundingClientRect().height || 0;
  const topPadding = Math.min(targetBottom + 20, map.getContainer().clientHeight * 0.48);
  const padding = { top: topPadding, right: 28, bottom: controlsHeight + 26, left: 28 };
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
  if (soloGameMode) return;
  const catalogue = Array.isArray(window.BUSSOLE_TARGETS) ? window.BUSSOLE_TARGETS : [];
  if (!catalogue.length) {
    statusEl.textContent = 'The random target catalogue could not be loaded.';
    return;
  }
  const roll = Math.random();
  const category = roll < .35 ? 'capital' : roll < .70 ? 'city' : 'landmark';
  let candidates = catalogue.filter(target =>
    target.category === category &&
    !usedRandomTargets.has(targetKey(target)) &&
    targetKey(target) !== lastRandomTargetKey
  );
  if (!candidates.length) {
    candidates = catalogue.filter(target =>
      !usedRandomTargets.has(targetKey(target)) &&
      targetKey(target) !== lastRandomTargetKey
    );
  }
  if (!candidates.length) {
    usedRandomTargets.clear();
    candidates = catalogue.filter(target => targetKey(target) !== lastRandomTargetKey);
  }
  const target = weightedRandom(candidates);
  const key = targetKey(target);
  usedRandomTargets.add(key);
  lastRandomTargetKey = key;
  const label = target.country ? `${target.name}, ${target.country}` : target.name;
  setTarget(target.lat, target.lon, label, true);
}

function showPrototypeLine() {
  if (lineRevealed || compassSubmitted || (soloGameMode && !soloController?.canAim())) return;
  if (!locationReady) return;
  if (!compassUsable && !manualBearing) return;
  if (!mapReady || !targetLatLng) return;
  let distanceMeters = ROUTE_DISTANCE_METERS;
  if (gameMode === 'hard') {
    const distanceKm = window.BussoleDistanceInput
      ? window.BussoleDistanceInput.parse(distanceInput.value)
      : Number(distanceInput.value.replace(/['’‘\s]/g, '').replace(',', '.'));
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      statusEl.textContent = 'Enter a valid distance for Pro mode.';
      distanceInput.focus();
      return;
    }
    distanceMeters = distanceKm * 1000;
  }
  if (multiplayerController?.isActive()) {
    compassSubmitted = true;
    multiplayerController.submitLine({
      lat: playerLatLng[0],
      lon: playerLatLng[1],
      heading,
      distanceMeters
    });
    showLineBtn.disabled = true;
    statusEl.textContent = 'Line locked. Waiting for the other explorers…';
    return;
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

  globeLines.setLine('prototype-route', route, '#e41a1c', 3.5, true);
  globeLines.setLine('prototype-error', errorArc, '#facf0a');
  const initialDistance = angleBetween(toUnitVector(playerLatLng), toUnitVector(targetLatLng)) * EARTH_RADIUS;
  errorEl.textContent = `${window.BussoleScoring.points(errorMeters, initialDistance)} / 1000 points · Error: ${(errorMeters / 1000).toFixed(1)} km`;
  window.dispatchEvent(new CustomEvent('bussole-solo-result', {detail:{
    submission:{lat:playerLatLng[0],lon:playerLatLng[1],heading,distanceMeters},
    target:{lat:targetLatLng[0],lon:targetLatLng[1],label:targetLabel},mode:gameMode,
    points:window.BussoleScoring.points(errorMeters, initialDistance),errorMeters
  }}));
  statusEl.textContent = `Line locked at ${Math.round(heading)}°. Drag or rotate with two fingers to inspect.`;
  lineRevealed = true;
  updatePlayerBlur();
  if (!multiplayerMode) stopSoloTimer();
  updateGoButtonState();
  updateTargetMarker();
  setMapInteraction(true);
  frameResult([playerLatLng, targetLatLng, errorOrigin]);
}

function renderMultiplayerResults(entries, roundTarget, mode) {
  if (!mapReady) return [];
  clearLines();
  clearMultiplayerLayers();
  targetLatLng = [roundTarget.lat, roundTarget.lon];
  targetLabel = roundTarget.label;
  targetEl.textContent = targetLabel;
  const boundsPoints = [playerLatLng, targetLatLng];
  const results = entries.map((entry, index) => {
    if (!entry.submission && entry.publicResult) {
      const shared = entry.publicResult;
      if (window.BussolePublicPrivacy.hasGeometry(shared)) {
        window.BussolePublicPrivacy.fadeParts(shared.route).forEach((part, partIndex) => {
          addMultiplayerLine(`multiplayer-route-${index}-${partIndex}`, part.points, window.BussolePublicPrivacy.alpha(entry.color, part.opacity), 3.5);
        });
        addMultiplayerLine(`multiplayer-error-${index}`, shared.errorArc, entry.errorColor || '#facf0a', 3.5);
        boundsPoints.push(...shared.route, ...shared.errorArc);
      }
      return { ...entry, errorMeters: undefined, points: shared.points };
    }
    if (!entry.submission) return { ...entry, errorMeters: null, points: 0 };
    const submission = entry.submission;
    const route = greatCirclePoints(
      submission.lat,
      submission.lon,
      submission.heading,
      submission.distanceMeters
    );
    const errorOrigin = mode === 'hard'
      ? route[route.length - 1]
      : nearestPointOnLine(targetLatLng, route).point;
    const errorMeters = angleBetween(toUnitVector(errorOrigin), toUnitVector(targetLatLng)) * EARTH_RADIUS;
    const errorArc = greatCircleArcBetween(errorOrigin, targetLatLng);
    addMultiplayerLine(`multiplayer-route-${index}`, route, entry.color, 3.5, true);
    addMultiplayerLine(`multiplayer-error-${index}`, errorArc, entry.errorColor || '#facf0a', 3.5);
    boundsPoints.push([submission.lat, submission.lon], errorOrigin);
    const initialDistance = angleBetween(toUnitVector([submission.lat, submission.lon]), toUnitVector(targetLatLng)) * EARTH_RADIUS;
    return { ...entry, errorMeters, points: entry.publicResult?.points ?? window.BussoleScoring.points(errorMeters, initialDistance) };
  });

  lineRevealed = true;
  updatePlayerBlur();
  updateTargetMarker();
  distanceInput.blur();
  distanceInputWrap.classList.add('hidden');
  window.BussoleMobileLayout?.update();
  const leaders = results.filter(result => result.submission || result.publicResult);
  const bestPoints = Math.max(0, ...leaders.map(result => result.points));
  const colours = [...new Set(leaders.filter(result => result.points === bestPoints).map(result => result.errorColor || '#facf0a'))];
  if (targetMarker && colours.length) targetMarker.getElement().style.background = colours.length === 1
    ? colours[0] : `linear-gradient(90deg, ${colours.map((colour,index) => `${colour} ${index/colours.length*100}% ${(index+1)/colours.length*100}%`).join(', ')})`;
  updateAccessPanel();
  setMapInteraction(true);
  frameResult(boundsPoints);
  statusEl.textContent = 'All routes revealed. Drag or rotate with two fingers to inspect.';
  return results.sort((first, second) =>
    (first.errorMeters ?? Infinity) - (second.errorMeters ?? Infinity)
  );
}

function resetPrototype() {
  if (soloGameMode) return;
  if (!multiplayerMode) window.dispatchEvent(new CustomEvent('bussole-solo-start'));
  if (!multiplayerMode) stopSoloTimer();
  compassSubmitted = false;
  clearLines();
  clearMultiplayerLayers();
  removeTargetMarker();
  lineRevealed = false;
  updatePlayerBlur();
  updateGoButtonState();
  setMapInteraction(false);
  frameAimingView(false);
  statusEl.textContent = 'Aiming view restored. The target is unchanged.';
}

function updateBearing(value, rotateMap = false) {
  heading = normalizeHeading(Number(value) || 0);
  bearingInput.value = String(Math.round(heading));
  bearingValue.value = `${Math.round(heading)}°`;
  compassNeedle.style.transform = `translate(-50%, -50%) rotate(${-heading}deg)`;
  if (rotateMap && mapReady && !lineRevealed) {
    map.setBearing(heading);
  }
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

function applyOrientationFrame() {
  orientationFrameId = null;
  if (pendingHeading === null) return;
  updateBearing(pendingHeading, true);
  updateGoButtonState();
}

function handleCompassHeading(nextHeading) {
  compassUsable = true;
  if (compassWarning && !lineRevealed && !compassSubmitted) statusEl.textContent = 'Compass ready. Move phone to set direction.';
  compassWarning = null;
  const change = smoothHeading === null ? 180 : angularDistanceDegrees(smoothHeading, nextHeading);
  const smoothing = change > 45 ? .65 : change > 15 ? .38 : .16;
  smoothHeading = smoothAngle(smoothHeading, nextHeading, smoothing);
  pendingHeading = smoothHeading;
  if (orientationFrameId === null) orientationFrameId = requestAnimationFrame(applyOrientationFrame);
}

function handleCompassStatus(reason) {
  compassUsable = false;
  pendingHeading = null;
  compassWarning = reason === 'tilted'
    ? 'Hold the phone flatter to aim with its top edge.'
    : 'Compass unavailable. Open in Safari or Chrome and allow motion sensors.';
  if (!lineRevealed && !manualBearing && !compassSubmitted) statusEl.textContent = compassWarning;
  updateGoButtonState();
}

async function startOrientation(permissionAlreadyGranted = false) {
  if (orientationStarted) return true;
  if (typeof DeviceOrientationEvent === 'undefined') {
    compassWarning = 'Motion sensors are unavailable in this browser.';
    return false;
  }
  if (!permissionAlreadyGranted &&
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    const permission = await DeviceOrientationEvent.requestPermission(true);
    if (permission !== 'granted') {
      orientationPermissionGranted = false;
      compassWarning = 'Motion access was denied. Allow motion sensors in this site’s settings, then retry.';
      return false;
    }
  }
  orientationPermissionGranted = true;
  compassTracker = window.BussoleCompass.createTracker({ onHeading: handleCompassHeading, onStatus: handleCompassStatus });
  compassTracker.start();
  orientationStarted = true;
  return true;
}

function updateClearSearchButton() {
  clearSearchBtn.style.visibility = searchBox.value ? 'visible' : 'hidden';
}

function openSearchPanel() {
  if (soloGameMode) return;
  searchPanel.classList.remove('hidden');
  requestAnimationFrame(() => searchBox.focus({ preventScroll: true }));
}

function closeSearchPanel() {
  searchPanel.classList.add('hidden');
  suggestionsEl.style.display = 'none';
  searchBox.blur();
  requestAnimationFrame(() => window.scrollTo(0, 0));
}

function selectSearchResult(result) {
  setTarget(
    Number.parseFloat(result.lat),
    Number.parseFloat(result.lon),
    result.display_name
  );
  closeSearchPanel();
}

function showSuggestions(results) {
  suggestionsEl.innerHTML = '';
  if (!results.length) {
    suggestionsEl.style.display = 'none';
    return;
  }
  results.forEach(result => {
    const option = document.createElement('div');
    option.className = 'suggestion';
    option.textContent = result.display_name;
    option.addEventListener('click', () => selectSearchResult(result));
    suggestionsEl.appendChild(option);
  });
  suggestionsEl.style.display = 'block';
}

async function fetchSearchResults(query, limit = 5) {
  const surprise = window.BussoleRoundTargets.searchEasterEgg(query);
  if (surprise) return [{lat: surprise.lat, lon: surprise.lon, display_name: surprise.label}];
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=${limit}`,
    { headers: { 'Accept-Language': 'en' } }
  );
  if (!response.ok) throw new Error('Search unavailable');
  return response.json();
}

async function searchTarget() {
  if (soloGameMode) return;
  const query = searchBox.value.trim();
  if (!query) return;
  statusEl.textContent = 'Searching…';
  try {
    const results = await fetchSearchResults(query, 1);
    if (!results.length) {
      statusEl.textContent = 'Target not found. Try another search.';
      return;
    }
    selectSearchResult(results[0]);
  } catch {
    statusEl.textContent = 'Search unavailable. Please try again.';
  }
}

function updateAccessPanel() {
  const missing = !locationReady || (!compassUsable && !manualBearing);
  const motionAvailable = typeof DeviceOrientationEvent !== 'undefined';
  const needsMotionGesture = motionAvailable && !orientationPermissionGranted &&
    typeof DeviceOrientationEvent.requestPermission === 'function';
  // Chrome/Android needs no motion-permission tap. Wait for the automatic GPS
  // request and first absolute heading instead of flashing a permission dialog.
  // The GPS timeout and compass tracker's timeout expose real failures normally.
  const waiting = automaticAccessCheck && motionAvailable && !needsMotionGesture &&
    !locationError && !compassWarning && (!mapReady ||
      (!locationReady && Boolean(locationRequest)) || (!compassUsable && orientationStarted));
  accessPanel.classList.toggle('hidden', !missing || lineRevealed || compassSubmitted || waiting);
  if (missing && waiting && !lineRevealed && !compassSubmitted) {
    statusEl.textContent = 'Connecting location and compass…';
  }
  if (!missing && !lineRevealed && !compassSubmitted && statusEl.textContent === 'Connecting location and compass…') {
    statusEl.textContent = 'Location and compass ready. Move phone to set direction.';
  }
  accessRetry.disabled = accessBusy;
  accessRetry.textContent = accessBusy ? 'Checking access…'
    : needsMotionGesture ? 'Enable location & compass' : 'Retry location & compass';
  accessMessage.textContent = locationError || compassWarning || (!locationReady
    ? 'Allow location access to play from your real position.'
    : needsMotionGesture ? 'Allow motion access, then hold the phone fairly flat to aim.'
    : 'Waiting for a compass reading. Hold the phone fairly flat, then retry if needed.');
}

function persistAccess() {
  try {
    sessionStorage.setItem('bussoleGlobeLaunch', JSON.stringify({
      coordinates: locationReady ? { latitude: playerLatLng[0], longitude: playerLatLng[1] } : null,
      orientationGranted: orientationPermissionGranted, acquiredAt: Date.now()
    }));
  } catch { /* A new page can recover access through the retry button. */ }
}

function refreshPlayerLocation(recenter = true) {
  if (locationRequest) return locationRequest;
  locationRequest = (async () => {
    try {
      if (!navigator.geolocation) throw new Error('Location is unavailable in this browser.');
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, maximumAge: 5000, timeout: 12000
      }));
      const { latitude, longitude } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('No valid location was received.');
      playerLatLng = [latitude, longitude];
      locationReady = true;
      locationError = null;
      updatePlayerMarker();
      if (recenter && !lineRevealed && !compassSubmitted) frameAimingView(false);
      updatePlayerBlur();
      persistAccess();
      return true;
    } catch (error) {
      locationReady = false;
      stopSoloTimer();
      locationError = error.code === 1 ? 'Location access was denied. Allow location in this site’s settings, then retry.'
        : error.code === 3 ? 'Location timed out. Check that location services are enabled, then retry.'
        : `Location unavailable: ${error.message || 'please retry'}`;
      statusEl.textContent = locationError;
      return false;
    } finally { updateGoButtonState(); }
  })();
  locationRequest.finally(() => { locationRequest = null; });
  return locationRequest;
}

function useMyLocation() {
  if (accessRequest) return accessRequest;
  accessBusy = true;
  automaticAccessCheck = false;
  compassUsable = false;
  pendingHeading = null;
  smoothHeading = null;
  if (orientationFrameId !== null) cancelAnimationFrame(orientationFrameId);
  orientationFrameId = null;
  compassTracker?.stop();
  orientationStarted = false;
  statusEl.textContent = 'Requesting location and compass access…';
  // Call before any await: iOS requires the current button's user activation.
  const orientation = startOrientation().catch(() => {
    orientationPermissionGranted = false;
    compassWarning = 'Motion access is blocked. Check this site’s sensor permissions, then retry.';
    return false;
  });
  const location = refreshPlayerLocation();
  updateAccessPanel();
  accessRequest = Promise.all([orientation, location]).then(() => persistAccess()).finally(() => {
    accessBusy = false; accessRequest = null; updateGoButtonState();
  });
  return accessRequest;
}
accessRetry.addEventListener('click', useMyLocation);

function recheckAccess() {
  if (!mapReady || lineRevealed || compassSubmitted || document.visibilityState === 'hidden') return;
  automaticAccessCheck = true;
  refreshPlayerLocation();
  if (orientationPermissionGranted && !accessBusy) {
    compassTracker?.stop(); orientationStarted = false; compassUsable = false;
    startOrientation(true).catch(() => handleCompassStatus('unavailable'));
    updateGoButtonState();
  }
}
document.addEventListener('visibilitychange', recheckAccess);
window.addEventListener('pageshow', recheckAccess);

function setMode(mode) {
  gameMode = mode;
  distanceInputWrap.classList.toggle('hidden', mode !== 'hard');
  compassEl.classList.toggle('hidden', mode !== 'easy');
  if (mapReady) {
    resetPrototype();
    const modeLabel = { easy: 'Easy', medium: 'Normal', hard: 'Pro' }[mode];
    statusEl.textContent = `${modeLabel} mode ready. The target is unchanged.`;
  }
}

bearingInput.addEventListener('input', event => {
  manualBearing = true;
  updateBearing(event.target.value, true);
  updateGoButtonState();
});
randomTargetBtn.addEventListener('click', chooseRandomTarget);
showLineBtn.addEventListener('click', showPrototypeLine);
resetBtn.addEventListener('click', resetPrototype);
openSearchBtn.addEventListener('click', openSearchPanel);
searchCloseBtn.addEventListener('click', closeSearchPanel);
searchPanel.addEventListener('click', event => {
  if (event.target === searchPanel) closeSearchPanel();
});
searchBtn.addEventListener('click', searchTarget);
searchBox.addEventListener('keydown', event => {
  if (event.key === 'Enter') searchTarget();
});
searchBox.addEventListener('input', () => {
  const query = searchBox.value.trim();
  updateClearSearchButton();
  setRandomButtonState(false);
  clearTimeout(searchTimeout);
  if (query.length < 3) {
    suggestionsEl.style.display = 'none';
    return;
  }
  searchTimeout = setTimeout(async () => {
    try {
      showSuggestions(await fetchSearchResults(query));
    } catch {
      suggestionsEl.style.display = 'none';
    }
  }, 300);
});
clearSearchBtn.addEventListener('click', () => {
  searchBox.value = '';
  suggestionsEl.style.display = 'none';
  clearTimeout(searchTimeout);
  updateClearSearchButton();
  setRandomButtonState(false);
  searchBox.focus({ preventScroll: true });
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !searchPanel.classList.contains('hidden')) closeSearchPanel();
});
updateClearSearchButton();
setRandomButtonState(false);
setMode(requestedMode);
updateBearing(0);

window.BussoleGlobe = {
  isReady() {
    return mapReady;
  },
  registerSolo(controller) {
    soloController = controller;
    updateGoButtonState();
  },
  setSoloTarget(target) {
    compassSubmitted = false;
    distanceInput.blur();
    distanceInput.value = '';
    document.body.classList.remove('round-revealed');
    setTarget(target.lat, target.lon, target.label, true);
    updatePlayerBlur();
  },
  revealSoloMiss() {
    if (lineRevealed) return;
    stopSoloTimer();
    lineRevealed = true;
    updatePlayerBlur();
    updateTargetMarker();
    updateGoButtonState();
    setMapInteraction(true);
    statusEl.textContent = "Time’s up. No guess submitted. Drag the globe to inspect the target.";
    errorEl.textContent = '0 / 1000 points · DNF';
    frameResult([playerLatLng, targetLatLng]);
  },
  registerMultiplayer(controller) {
    multiplayerController = controller;
  },
  setBlurEnabled(enabled) {
    blurEnabled = Boolean(enabled);
    updatePlayerBlur();
  },
  setMultiplayerTarget(target) {
    if (!target) return;
    setTarget(Number(target.lat), Number(target.lon), target.label || 'Multiplayer target');
  },
  revealMultiplayer(entries, target, mode) {
    return renderMultiplayerResults(entries, target, mode);
  },
  publicResult(submission, target, mode) {
    return window.BussolePublicPrivacy.publish(submission, target, mode, {
      route: value => greatCirclePoints(value.lat, value.lon, value.heading, value.distanceMeters),
      destination: destLatLng, nearest: nearestPointOnLine, arc: greatCircleArcBetween,
      distance: (from, to) => angleBetween(toUnitVector(from), toUnitVector(to)) * EARTH_RADIUS
    });
  },
  setStatus(message) {
    statusEl.textContent = message;
  },
  setGoEnabled(enabled) {
    compassSubmitted = !enabled;
    updateGoButtonState();
  },
  refreshLocation() {
    return useMyLocation();
  }
};
