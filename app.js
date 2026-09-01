const map = L.map('map', {
  zoomControl: true,

  rotate: true,
  bearing: 0,
  touchRotate: false,

  inertia: true,
  inertiaDeceleration: 2000,
  inertiaMaxSpeed: 3000,

  zoomAnimation: true,
  zoomAnimationThreshold: 10,
  fadeAnimation: true,
  markerZoomAnimation: true,

  zoomSnap: 0,
  zoomDelta: 1,
});
map.touchZoom.enable();
// Keep the natural pinch centre so zooming and panning can happen together.
map.options.touchZoom = true;
map.doubleClickZoom.enable();
map.options.doubleClickZoom = 'center';

L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    maxZoom: 19,
    attribution: 'Tiles © Esri'
  }
).addTo(map);

const whiteMarkerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  className: 'white-marker-icon'
});

map.on('move', () => {
  if (blurEnabled && blurCircleEl && lastPos) {
    updateBlurPosition(
      lastPos.coords.latitude,
      lastPos.coords.longitude
    );
  }
});

let userMarker = null;
let headingLine = null;
let watchId = null;
let lastPos = null;
let hasCenteredOnPlayer = false;
let lineVisible = false;
let lineLocked = false;
let lockedPoints = null;
let lastHeading = null;
let targetMarker = null;
let targetLatLng = null;
let searchTimeout = null;
let smoothHeading = null;
let gameMode = "medium"; // default
let timerEnabled = false;
let timerDuration = 0;
let timerInterval = null;
let remainingTime = 0;
let roundActive = false;
let blurEnabled = false;
let blurCircleEl = null;
let errorLine = null;
let errorOriginLatLng = null;
let orientationTrackingStarted = false;
let lastAbsoluteOrientationAt = 0;
let pendingHeading = null;
let orientationFrameId = null;
const randomTargets = Array.isArray(window.BUSSOLE_TARGETS)
  ? window.BUSSOLE_TARGETS
  : [];
const usedRandomTargets = new Set();
let lastRandomTargetKey = null;
let multiplayerController = null;
let multiplayerLayers = [];

const menuEl = document.getElementById('menu');
const hudEl = document.getElementById('hud');
const distanceInputWrap = document.getElementById('distanceInputWrap');
const distanceInput = document.getElementById('distanceInput');

document.querySelectorAll('.modeBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    timerEnabled = timerCheckbox.checked;
    blurEnabled = blurCheckbox.checked;
    
    if (timerEnabled) {
      const value = parseInt(timerDurationInput.value);
    
      if (!value || value <= 0) {
        alert("Insert a valid timer duration in seconds.");
        return;
      }
    
      timerDuration = value;
    }
        
    gameMode = btn.dataset.mode;

    menuEl.style.display = 'none';
    hudEl.style.display = 'block';

    // HARD → show distance input
    if (gameMode === 'hard') {
      distanceInputWrap.style.display = 'flex';
    } else {
      distanceInputWrap.style.display = 'none';
    }

    // 🧭 COMPASS in EASY only
    if (gameMode === 'easy') {
      compassContainer.classList.remove('hidden');
    } else {
      compassContainer.classList.add('hidden');
    }

    setStatus('Mode: ' + gameMode);
    requestAnimationFrame(() => map.invalidateSize());
  });
});



const startBtn = document.getElementById('startBtn');
const showLineBtn = document.getElementById('showLineBtn');
const resetBtn = document.getElementById('resetBtn');
const homeBtn = document.getElementById('homeBtn');
const searchBtn = document.getElementById('searchBtn');
const randomBtn = document.getElementById('randomBtn');
const searchBox = document.getElementById('searchBox');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const statusEl = document.getElementById('status');
const suggestionsEl = document.getElementById('suggestions');
const distanceEl = document.getElementById('distance');
const compassContainer = document.getElementById('compass');
const compassNeedle = document.getElementById('compassNeedle');
const timerCheckbox = document.getElementById('timerCheckbox');
const timerSettings = document.getElementById('timerSettings');
const timerDurationInput = document.getElementById('timerDuration');
const blurCheckbox = document.getElementById('blurCheckbox');
const timerBox = document.getElementById('timerBox');
const distanceEasterEggEl = document.getElementById('distanceEasterEgg');

timerCheckbox.addEventListener('change', () => {
  timerSettings.style.display = timerCheckbox.checked ? 'block' : 'none';
});

function setStatus(s) { statusEl.textContent = s; }

function showDistanceEasterEgg() {
  distanceEasterEggEl.style.top =
    `${hudEl.getBoundingClientRect().bottom + 18}px`;
  distanceEasterEggEl.classList.remove('visible');
  void distanceEasterEggEl.offsetWidth;
  distanceEasterEggEl.classList.add('visible');
}

function hideDistanceEasterEgg() {
  distanceEasterEggEl.classList.remove('visible');
}

function updateClearSearchButton() {
  clearSearchBtn.style.visibility = searchBox.value ? 'visible' : 'hidden';
}

function setRandomButtonState(hasRandomTarget) {
  randomBtn.textContent = hasRandomTarget ? 'Skip' : 'Random';
  randomBtn.setAttribute(
    'aria-label',
    hasRandomTarget ? 'Skip this random target' : 'Choose a random target'
  );
}

function targetKey(target) {
  return `${target.name}|${target.lat}|${target.lon}`;
}

function weightedRandom(items) {
  const totalWeight = items.reduce((sum, item) => sum + (item.weight || 1), 0);
  let choice = Math.random() * totalWeight;
  for (const item of items) {
    choice -= item.weight || 1;
    if (choice <= 0) return item;
  }
  return items[items.length - 1];
}

function chooseRandomTarget() {
  if (!randomTargets.length) return null;

  // Category odds are independent from catalogue size, so hundreds of UNESCO
  // sites cannot make capitals or famous cities unnaturally rare.
  const roll = Math.random();
  const category = roll < 0.35 ? 'capital' : roll < 0.70 ? 'city' : 'landmark';
  let candidates = randomTargets.filter(target =>
    target.category === category &&
    !usedRandomTargets.has(targetKey(target)) &&
    targetKey(target) !== lastRandomTargetKey
  );

  if (!candidates.length) {
    candidates = randomTargets.filter(target =>
      !usedRandomTargets.has(targetKey(target)) &&
      targetKey(target) !== lastRandomTargetKey
    );
  }
  if (!candidates.length) {
    usedRandomTargets.clear();
    candidates = randomTargets.filter(target => targetKey(target) !== lastRandomTargetKey);
  }

  return weightedRandom(candidates);
}

function setTarget(lat, lon, label, isRandom = false) {
  targetLatLng = [lat, lon];
  searchBox.value = label;
  updateClearSearchButton();
  suggestionsEl.style.display = 'none';
  dismissSearchKeyboard();
  setRandomButtonState(isRandom);

  if (targetMarker) targetMarker.setLatLng(targetLatLng);
  else targetMarker = L.marker(targetLatLng, { icon: whiteMarkerIcon }).addTo(map);

  updateDistanceToTarget();
}

function dismissSearchKeyboard() {
  searchBox.blur();
  requestAnimationFrame(() => window.scrollTo(0, 0));
}

function showBlurCircle(lat, lon) {

  if (!blurEnabled) return;

  if (!blurCircleEl) {
    blurCircleEl = document.createElement('div');
    blurCircleEl.className = 'blur-circle';
    document.getElementById('map').appendChild(blurCircleEl);
  }

  updateBlurPosition(lat, lon);
}

function updateBlurPosition(lat, lon) {
  if (!blurCircleEl) return;

  const point = map.latLngToContainerPoint([lat, lon]);

  blurCircleEl.style.left = point.x + 'px';
  blurCircleEl.style.top = point.y + 'px';

  // dynamically adjust circle radius for ~2 km
  const metersPerPixel = 40075016.686 / (256 * Math.pow(2, map.getZoom()));
  const radiusPixels = 400 / metersPerPixel;

  blurCircleEl.style.width = (radiusPixels * 2) + 'px';
  blurCircleEl.style.height = (radiusPixels * 2) + 'px';
}

function hideBlurCircle() {
  if (blurCircleEl) {
    blurCircleEl.remove();
    blurCircleEl = null;
  }
}

function lockMap() {
  map.dragging.disable();
  map.touchZoom.disable();
  map.scrollWheelZoom.disable();
  map.doubleClickZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
}

function unlockMap() {
  map.dragging.enable();
  map.touchZoom.enable();
  map.scrollWheelZoom.enable();
  map.doubleClickZoom.enable();
  map.boxZoom.enable();
  map.keyboard.enable();
}

function startTimer() {

  if (!timerEnabled || timerDuration <= 0) return;

  remainingTime = timerDuration;
  timerBox.style.display = 'block';
  timerBox.textContent = remainingTime + "s";

  clearInterval(timerInterval);

  timerInterval = setInterval(() => {

    remainingTime--;
    timerBox.textContent = remainingTime + "s";

    if (remainingTime <= 0) {

      clearInterval(timerInterval);
      timerBox.textContent = "0s";

      showLineBtn.click();
      hideBlurCircle();
    }

  }, 1000);
}

// Calculate a destination from latitude, longitude, bearing and distance.
function destLatLng(lat, lon, bearingDeg, distanceMeters){
  const R = 6378137;
  const brng = bearingDeg * Math.PI/180;
  const d = distanceMeters;
  const lat1 = lat * Math.PI/180;
  const lon1 = lon * Math.PI/180;
  const lat2 = Math.asin(Math.sin(lat1)*Math.cos(d/R)+Math.cos(lat1)*Math.sin(d/R)*Math.cos(brng));
  const lon2 = lon1 + Math.atan2(Math.sin(brng)*Math.sin(d/R)*Math.cos(lat1), Math.cos(d/R)-Math.sin(lat1)*Math.sin(lat2));
  return [lat2*180/Math.PI, lon2*180/Math.PI];
}

function smoothAngle(prev, next, alpha) {
  if (prev === null) return next;

  const prevRad = prev * Math.PI / 180;
  const nextRad = next * Math.PI / 180;

  const x = (1 - alpha) * Math.cos(prevRad) + alpha * Math.cos(nextRad);
  const y = (1 - alpha) * Math.sin(prevRad) + alpha * Math.sin(nextRad);

  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function animateMapBearingTo(targetBearing, duration = 700) {
  return new Promise(resolve => {
    const startBearing = map.getBearing();
    const startTime = performance.now();

    // Shortest rotation direction.
    const delta = ((targetBearing - startBearing + 540) % 360) - 180;

    function animate(now) {
      const t = Math.min((now - startTime) / duration, 1);

      // Ease-in-out.
      const eased = t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;

      map.setBearing(startBearing + delta * eased);

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        map.setBearing(targetBearing);
        resolve();
      }
    }

    requestAnimationFrame(animate);
  });
}


// Generate points along a great circle, with cubic easing for more visible curvature.
function greatCirclePoints(lat, lon, bearing, distance, steps){
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const f = t*t*t; // cubic ease-in
    const d = distance * f;
    points.push(destLatLng(lat, lon, bearing, d));
  }
  return points;
}

// Update the moving line (only while it is visible and unlocked).
function updateLine(position, heading){
  if (!lineVisible || lineLocked) return;
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  const distance = 20000000; // 10.000 km
  const points = greatCirclePoints(lat, lon, heading, distance, 400);

  if (userMarker) userMarker.setLatLng([lat, lon]);
  else userMarker = L.marker([lat, lon], { icon: whiteMarkerIcon }).addTo(map);

  if (headingLine) headingLine.setLatLngs(points);
  else headingLine = L.polyline(points, { color: 'red', weight: 2 }).addTo(map);
}

// Request compass permission on iOS.
async function requestDeviceOrientationPermission(){
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const resp = await DeviceOrientationEvent.requestPermission();
      return resp === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

async function fetchSuggestions(query) {

  // For my funny friends.
  if (query.toLowerCase().includes("fanculo")) {

    const fakeResult = [{
      display_name: "Fanculo",
      lat: null,
      lon: null,
      isEasterEgg: true
    }];

    showSuggestions(fakeResult);
    return;
  }
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;

  const res = await fetch(url, {
    headers: { 'Accept-Language': 'en' }
  });
  const data = await res.json();

  showSuggestions(data);
}


// Calculate the distance between two points on the sphere.
function distance(lat1, lon1, lat2, lon2){
  const R = 6378137;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180) *
            Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getRandomEarthCoordinates() {
  const lat = Math.random() * 180 - 90;     // -90 to +90
  const lon = Math.random() * 360 - 180;    // -180 to +180
  return [lat, lon];
}

function toUnitVector([lat, lon]) {
  const phi = lat * Math.PI / 180;
  const lambda = lon * Math.PI / 180;
  const cosPhi = Math.cos(phi);
  return [
    cosPhi * Math.cos(lambda),
    cosPhi * Math.sin(lambda),
    Math.sin(phi)
  ];
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

function vectorLength(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalizeVector(v) {
  const length = vectorLength(v);
  if (length < 1e-12) return null;
  return v.map(value => value / length);
}

function angleBetween(a, b) {
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
}

function vectorToLatLng(v) {
  return [
    Math.atan2(v[2], Math.hypot(v[0], v[1])) * 180 / Math.PI,
    Math.atan2(v[1], v[0]) * 180 / Math.PI
  ];
}

// Interpolate the shortest great-circle arc so the yellow error segment
// follows the globe instead of appearing as a straight projected chord.
function greatCircleArcBetween(from, to) {
  const start = toUnitVector(from);
  const end = toUnitVector(to);
  const omega = angleBetween(start, end);
  const sinOmega = Math.sin(omega);

  if (omega < 1e-10 || Math.abs(sinOmega) < 1e-10) return [from, to];

  const steps = Math.min(
    160,
    Math.max(16, Math.ceil(omega * 180 / Math.PI * 2))
  );
  const points = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const startWeight = Math.sin((1 - t) * omega) / sinOmega;
    const endWeight = Math.sin(t * omega) / sinOmega;
    const point = normalizeVector([
      startWeight * start[0] + endWeight * end[0],
      startWeight * start[1] + endWeight * end[1],
      startWeight * start[2] + endWeight * end[2]
    ]);
    const latLng = vectorToLatLng(point);
    if (points.length) {
      const previousLongitude = points[points.length - 1][1];
      while (latLng[1] - previousLongitude > 180) latLng[1] -= 360;
      while (latLng[1] - previousLongitude < -180) latLng[1] += 360;
    }
    points.push(latLng);
  }

  return points;
}

// Return the nearest point on a polyline made of great-circle segments.
// The target-to-route segment is therefore perpendicular to the route on the globe.
function nearestPointOnLine(point, linePoints) {
  if (!point || !linePoints || linePoints.length < 2) return null;

  const earthRadius = 6378137;
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

  for (let i = 0; i < linePoints.length - 1; i++) {
    const start = toUnitVector(linePoints[i]);
    const end = toUnitVector(linePoints[i + 1]);
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
    const candidateIsOnSegment = Math.abs(
      angleBetween(start, candidate) + angleBetween(candidate, end) - segmentAngle
    ) < 1e-7;

    if (candidateIsOnSegment) consider(candidate);
  }

  if (!bestVector) return null;
  return {
    point: vectorToLatLng(bestVector),
    distance: bestAngle * earthRadius
  };
}

function drawErrorLine(from, to) {
  const points = greatCircleArcBetween(from, to);
  if (errorLine) {
    errorLine.setLatLngs(points);
  } else {
    errorLine = L.polyline(points, {
      color: '#facf0a',
      weight: 3,
      opacity: 0.95,
      interactive: false
    }).addTo(map);
  }
  errorLine.bringToFront();
}

function removeErrorLine() {
  errorOriginLatLng = null;
  if (!errorLine) return;
  map.removeLayer(errorLine);
  errorLine = null;
}

// Update the target's distance from the plotted route.
function updateDistanceToTarget() {
  if (!targetLatLng || !lockedPoints) {
    removeErrorLine();
    return;
  }

  let d;

  // HARD → distance from the plotted endpoint.
  if (gameMode === 'hard') {
    const lastPoint = lockedPoints[lockedPoints.length - 1];

    d = distance(
      targetLatLng[0], targetLatLng[1],
      lastPoint[0], lastPoint[1]
    );

    distanceEl.textContent =
      `Final error: ${(d/1000).toFixed(1)} km`;
    errorOriginLatLng = lastPoint;
    drawErrorLine(targetLatLng, lastPoint);
  }

  // MEDIUM / EASY → perpendicular distance from the route.
  else {
    const nearest = nearestPointOnLine(targetLatLng, lockedPoints);
    if (!nearest) return;
    d = nearest.distance;

    distanceEl.textContent =
      `Distance from target: ${(d/1000).toFixed(1)} km`;
    errorOriginLatLng = nearest.point;
    drawErrorLine(targetLatLng, nearest.point);
  }
}

function unwrapLongitudeNear(referenceLongitude, [lat, lon]) {
  while (lon - referenceLongitude > 180) lon -= 360;
  while (lon - referenceLongitude < -180) lon += 360;
  return [lat, lon];
}

function fitResultView() {
  if (hudEl.style.display === 'none' || !lastPos || !targetLatLng || !errorOriginLatLng) return;

  const player = [lastPos.coords.latitude, lastPos.coords.longitude];
  const referenceLongitude = player[1];
  const points = [
    player,
    unwrapLongitudeNear(referenceLongitude, targetLatLng),
    unwrapLongitudeNear(referenceLongitude, errorOriginLatLng)
  ];
  const hudHeight = hudEl.getBoundingClientRect().height || 0;

  const bounds = L.latLngBounds(points).pad(0.15);
  const resultPadding = gameMode === 'easy' ? 130 : 60;
  const options = {
    paddingTopLeft: [60, hudHeight + 60],
    paddingBottomRight: [resultPadding, resultPadding],
    maxZoom: 16,
    animate: true,
    duration: 0.8
  };

  if (typeof map.flyToBounds === 'function') {
    map.flyToBounds(bounds, options);
  } else {
    map.fitBounds(bounds, options);
  }
}

function normalizeHeading(value) {
  return (value % 360 + 360) % 360;
}

function getScreenOrientationAngle() {
  const angle = screen.orientation && typeof screen.orientation.angle === 'number'
    ? screen.orientation.angle
    : (typeof window.orientation === 'number' ? window.orientation : 0);
  return angle || 0;
}

// Calculate a tilt-compensated heading from absolute W3C orientation angles.
// When the phone is flat, alpha alone is both more stable and well-defined.
function tiltCompensatedHeading(alpha, beta, gamma) {
  if (typeof alpha !== 'number') return null;
  if (typeof beta !== 'number' || typeof gamma !== 'number' ||
      (Math.abs(beta) < 0.5 && Math.abs(gamma) < 0.5)) {
    return normalizeHeading(360 - alpha);
  }

  const toRadians = Math.PI / 180;
  const x = beta * toRadians;
  const y = gamma * toRadians;
  const z = alpha * toRadians;
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

function angularDistance(a, b) {
  return Math.abs(((b - a + 540) % 360) - 180);
}

function applyOrientationFrame() {
  orientationFrameId = null;
  if (pendingHeading === null) return;

  const heading = pendingHeading;
  lastHeading = heading;

  // Keep the phone's direction at the top of the map.
  if (roundActive) {
    map.setBearing(normalizeHeading(360 - heading));
  }

  // Only one simple needle rotates. The labels no longer form separate,
  // rapidly moving compositing layers in Mobile Safari.
  if (gameMode === 'easy') {
    compassNeedle.style.transform =
      `translate(-50%, -50%) rotate(${-heading}deg)`;
  }

  if (lastPos && lineVisible && !lineLocked) {
    updateLine(lastPos, heading);
  }
}

// Handle compass data. iOS supplies a native compass heading; Android uses
// absolute alpha/beta/gamma values with tilt compensation. Rendering is synced
// to requestAnimationFrame so sensor bursts cannot overwhelm Safari.
function handleOrientationEvent(e) {
  let heading = null;

  if (typeof e.webkitCompassHeading === 'number') {
    heading = e.webkitCompassHeading;
  } else if (typeof e.alpha === 'number') {
    heading = tiltCompensatedHeading(e.alpha, e.beta, e.gamma);
  }

  if (heading === null || !Number.isFinite(heading)) return;
  heading = normalizeHeading(heading + getScreenOrientationAngle());

  const change = smoothHeading === null ? 180 : angularDistance(smoothHeading, heading);
  const smoothing = change > 45 ? 0.65 : change > 15 ? 0.38 : 0.16;
  smoothHeading = smoothAngle(smoothHeading, heading, smoothing);
  pendingHeading = smoothHeading;

  if (orientationFrameId === null) {
    orientationFrameId = requestAnimationFrame(applyOrientationFrame);
  }
}

function handleAbsoluteOrientationEvent(e) {
  if (typeof e.webkitCompassHeading !== 'number' && typeof e.alpha !== 'number') return;
  lastAbsoluteOrientationAt = performance.now();
  handleOrientationEvent(e);
}

function handleFallbackOrientationEvent(e) {
  if (performance.now() - lastAbsoluteOrientationAt < 1000) return;
  handleOrientationEvent(e);
}

function startOrientationTracking() {
  if (orientationTrackingStarted) return;
  orientationTrackingStarted = true;
  window.addEventListener('deviceorientationabsolute', handleAbsoluteOrientationEvent, true);
  window.addEventListener('deviceorientation', handleFallbackOrientationEvent, true);
}

function stopOrientationTracking() {
  if (!orientationTrackingStarted) return;
  window.removeEventListener('deviceorientationabsolute', handleAbsoluteOrientationEvent, true);
  window.removeEventListener('deviceorientation', handleFallbackOrientationEvent, true);
  orientationTrackingStarted = false;
  lastAbsoluteOrientationAt = 0;
  pendingHeading = null;
  if (orientationFrameId !== null) {
    cancelAnimationFrame(orientationFrameId);
    orientationFrameId = null;
  }
}

// Start tracking.
function start() {
  startBtn.disabled = true;
  hasCenteredOnPlayer = false;
  setStatus('Requesting permissions...');

  requestDeviceOrientationPermission().then(ok=>{
    if (!ok) setStatus('Device orientation permission denied (compass may not work).');
    else setStatus('Waiting for location & orientation...');

    startOrientationTracking();

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(pos=>{
        lastPos = pos;
        setStatus('Position acquired. Move phone to set direction.');
        if (timerEnabled && roundActive && !timerInterval) {
          startTimer();
        }
        // Enable controls when the position is ready.
        showLineBtn.disabled = false;
        resetBtn.disabled = false;

        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        if (userMarker) {
          userMarker.setLatLng([lat, lon]);
        } else {
          userMarker = L.marker([lat, lon], { icon: whiteMarkerIcon }).addTo(map);
        }

        // Centre once when the round begins. Further GPS updates must not
        // fight the player's own zooming and panning gestures.
        if (!hasCenteredOnPlayer) {
          map.setView([lat, lon], 16, {
            animate: false
          });
          hasCenteredOnPlayer = true;
        }

        if (blurEnabled) {
          showBlurCircle(lat, lon);
        }
      }, err=>{
        setStatus('Geolocation error: ' + err.message);
      }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
    } else {
      setStatus('Geolocation not supported.');
    }
  });
}

function showSuggestions(results) {
  suggestionsEl.innerHTML = '';

  if (!results.length) {
    suggestionsEl.style.display = 'none';
    return;
  }

  results.forEach(r => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.textContent = r.display_name;

    div.addEventListener('click', () => {
      selectSuggestion(r);
    });

    suggestionsEl.appendChild(div);
  });

  suggestionsEl.style.display = 'block';
}

function selectSuggestion(r) {

  let lat, lon;

  // Still for my friends
  if (r.isEasterEgg) {
    const coords = getRandomEarthCoordinates();
    lat = coords[0];
    lon = coords[1];
  } else {
    lat = parseFloat(r.lat);
    lon = parseFloat(r.lon);
  }

  setTarget(lat, lon, r.display_name);
}

document.addEventListener('click', (e) => {
  if (!searchBox.contains(e.target) && !suggestionsEl.contains(e.target)) {
    suggestionsEl.style.display = 'none';
  }
});


startBtn.addEventListener('click', () => {

  // validation before starting timer
  if (timerEnabled) {

    if (!targetLatLng) {
      alert("Select a target location first!");
      return;
    }

    if (gameMode === 'hard') {
      const km = parseFloat(distanceInput.value);
      if (!km) {
        alert("Insert distance for hard mode!");
        return;
      }
    }
  }
  roundActive = true;
  lockMap();
  start();
  if (multiplayerController) multiplayerController.markReady();
});


// Show the locked line.
showLineBtn.addEventListener('click', () => {
  if (multiplayerController && multiplayerController.isActive()) {
    if (!lastPos || lastHeading === null) return;
    const guessedKm = gameMode === 'hard' ? parseFloat(distanceInput.value) : null;
    if (gameMode === 'hard' && !guessedKm) {
      alert("Enter a distance!");
      return;
    }
    if (gameMode === 'hard' && guessedKm > 40075) showDistanceEasterEgg();
    multiplayerController.submitLine({
      lat: lastPos.coords.latitude,
      lon: lastPos.coords.longitude,
      heading: lastHeading,
      distanceMeters: gameMode === 'hard' ? guessedKm * 1000 : 20000000
    });
    showLineBtn.disabled = true;
    setStatus('Line locked. Waiting for the other explorers…');
    return;
  }
  if (lineLocked) return;
  roundActive = false;
  hideDistanceEasterEgg();

  // Smoothly return to north-up.
  const northUpAnimation = animateMapBearingTo(0);
  
  // Stop timer if running
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    timerBox.style.display = 'none';
  }
  if (!lastPos || lastHeading === null) return;

  lineVisible = true;
  lineLocked = true;

  const lat = lastPos.coords.latitude;
  const lon = lastPos.coords.longitude;

  let distanceMeters = 20000000;

  // HARD → use the entered distance.
  if (gameMode === 'hard') {
    const km = parseFloat(distanceInput.value);
    if (!km) {
      alert("Enter a distance!");
      return;
    }
    if (km > 40075) {
      showDistanceEasterEgg();
    }
    distanceMeters = km * 1000;
  }

  const points = greatCirclePoints(lat, lon, lastHeading, distanceMeters, 400);
  lockedPoints = points;

  if (headingLine) headingLine.setLatLngs(points);
  else headingLine = L.polyline(points, { color: 'red', weight: 3, noClip:true }).addTo(map);

  setStatus('Plotted line');

  updateDistanceToTarget();
  unlockMap();
  hideBlurCircle();

  // Once north is up, frame the player, target and yellow-segment origin.
  northUpAnimation.then(() => requestAnimationFrame(fitResultView));
});

// Reset the line.
resetBtn.addEventListener('click', () => {
  // Start a new aiming round
  roundActive = true;

  // Immediately rotate map according to current phone direction
  if (smoothHeading !== null) {
    map.setBearing((360 - smoothHeading) % 360);
  }
  
  if (headingLine) {
    map.removeLayer(headingLine);
    headingLine = null;
  }
  lineLocked = false;
  lockedPoints = null;
  lineVisible = false;
  removeErrorLine();
  hideDistanceEasterEgg();
  setStatus('The line was hidden. Press "Show line" to plot a new one.');
  distanceEl.textContent = '';
  lockMap();
  if (blurEnabled && lastPos) {
    showBlurCircle(
      lastPos.coords.latitude,
      lastPos.coords.longitude
    );
  }
  clearInterval(timerInterval);
  timerInterval = null;
  timerBox.style.display = 'none';
  
  if (timerEnabled) {
    startTimer();
  }
});

function resetGameToMenu() {
  roundActive = false;
  lineVisible = false;
  lineLocked = false;
  lockedPoints = null;
  smoothHeading = null;
  lastHeading = null;

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  stopOrientationTracking();
  clearInterval(timerInterval);
  timerInterval = null;
  timerBox.style.display = 'none';

  if (headingLine) {
    map.removeLayer(headingLine);
    headingLine = null;
  }
  removeErrorLine();
  clearMultiplayerLayers();
  hideDistanceEasterEgg();
  hideBlurCircle();
  unlockMap();
  map.setBearing(0);

  startBtn.disabled = false;
  showLineBtn.disabled = true;
  resetBtn.disabled = true;
  distanceEl.textContent = '';
  compassNeedle.style.transform = 'translate(-50%, -50%) rotate(0deg)';
  compassContainer.classList.add('hidden');

  if (targetMarker) {
    map.removeLayer(targetMarker);
    targetMarker = null;
  }
  targetLatLng = null;
  hasCenteredOnPlayer = false;
  searchBox.value = '';
  distanceInput.value = '';
  suggestionsEl.innerHTML = '';
  suggestionsEl.style.display = 'none';
  clearTimeout(searchTimeout);
  updateClearSearchButton();
  setRandomButtonState(false);

  if (lastPos) {
    map.setView(
      [lastPos.coords.latitude, lastPos.coords.longitude],
      16,
      { animate: false }
    );
  }

  distanceInputWrap.style.display = 'none';
  hudEl.style.display = 'none';
  menuEl.style.display = 'flex';
  dismissSearchKeyboard();
}

homeBtn.addEventListener('click', () => {
  if (multiplayerController && multiplayerController.isActive()) {
    multiplayerController.leaveRoom();
    return;
  }
  resetGameToMenu();
});

// Search for a target.
searchBtn.addEventListener('click', async () => {
  const q = searchBox.value;
  if (!q) return;
  dismissSearchKeyboard();

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.length) return;

  const lat = parseFloat(data[0].lat);
  const lon = parseFloat(data[0].lon);

  setTarget(lat, lon, data[0].display_name);
});

randomBtn.addEventListener('click', () => {
  const target = chooseRandomTarget();
  if (!target) {
    alert('The random target catalogue is unavailable.');
    return;
  }

  const key = targetKey(target);
  usedRandomTargets.add(key);
  lastRandomTargetKey = key;
  const label = target.country ? `${target.name}, ${target.country}` : target.name;
  setTarget(target.lat, target.lon, label, true);
});

// cleanup on unload
window.addEventListener('beforeunload', ()=> {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  stopOrientationTracking();
});

searchBox.addEventListener('input', () => {
  const q = searchBox.value.trim();
  updateClearSearchButton();
  setRandomButtonState(false);

  clearTimeout(searchTimeout);

  if (q.length < 3) {
    suggestionsEl.style.display = 'none';
    return;
  }

  searchTimeout = setTimeout(() => fetchSuggestions(q), 300);
});

clearSearchBtn.addEventListener('click', () => {
  searchBox.value = '';
  suggestionsEl.style.display = 'none';
  clearTimeout(searchTimeout);
  updateClearSearchButton();
  setRandomButtonState(false);
  searchBox.focus({ preventScroll: true });
});

updateClearSearchButton();
setRandomButtonState(false);

function clearMultiplayerLayers() {
  multiplayerLayers.forEach(layer => map.removeLayer(layer));
  multiplayerLayers = [];
}

function renderMultiplayerResults(entries, roundTarget, mode) {
  clearMultiplayerLayers();
  roundActive = false;
  unlockMap();
  map.setBearing(0);
  const boundsPoints = [roundTarget];
  const results = [];

  entries.forEach(entry => {
    if (!entry.submission) {
      results.push({ ...entry, errorMeters: null });
      return;
    }
    const submission = entry.submission;
    const route = greatCirclePoints(
      submission.lat,
      submission.lon,
      submission.heading,
      submission.distanceMeters,
      400
    );
    const routeLayer = L.polyline(route, {
      color: entry.color,
      weight: 3,
      opacity: 0.9,
      noClip: true
    }).addTo(map);
    multiplayerLayers.push(routeLayer);

    let errorOrigin;
    let errorMeters;
    if (mode === 'hard') {
      errorOrigin = route[route.length - 1];
      errorMeters = distance(errorOrigin[0], errorOrigin[1], roundTarget[0], roundTarget[1]);
    } else {
      const nearest = nearestPointOnLine(roundTarget, route);
      errorOrigin = nearest.point;
      errorMeters = nearest.distance;
    }
    const errorLayer = L.polyline(greatCircleArcBetween(errorOrigin, roundTarget), {
      color: entry.errorColor || '#facf0a',
      weight: 3,
      opacity: 0.95,
      interactive: false
    }).addTo(map);
    multiplayerLayers.push(errorLayer);
    boundsPoints.push([submission.lat, submission.lon], errorOrigin);
    results.push({ ...entry, errorMeters });
  });

  if (boundsPoints.length > 1) {
    map.fitBounds(L.latLngBounds(boundsPoints).pad(0.28), {
      animate: true,
      duration: 0.9,
      paddingTopLeft: [24, Math.max(120, hudEl.getBoundingClientRect().bottom + 20)],
      paddingBottomRight: [24, 70]
    });
  }
  setStatus('All routes revealed');
  return results.sort((a, b) =>
    (a.errorMeters ?? Infinity) - (b.errorMeters ?? Infinity)
  );
}

window.BussoleGame = {
  registerMultiplayer(controller) {
    multiplayerController = controller;
  },
  prepareMultiplayerRound(settings, roundTarget) {
    clearMultiplayerLayers();
    timerCheckbox.checked = Boolean(settings.timerEnabled);
    timerDurationInput.value = settings.timerDuration || 60;
    blurCheckbox.checked = false;
    document.querySelector(`.modeBtn[data-mode="${settings.mode}"]`).click();
    setTarget(roundTarget.lat, roundTarget.lon, roundTarget.label);
    startBtn.disabled = false;
    showLineBtn.disabled = true;
    resetBtn.disabled = true;
    startBtn.textContent = 'Ready';
    showLineBtn.textContent = 'Lock line';
  },
  revealMultiplayer(entries, roundTarget, mode) {
    return renderMultiplayerResults(entries, [roundTarget.lat, roundTarget.lon], mode);
  },
  resetMultiplayerRound() {
    clearMultiplayerLayers();
    startBtn.textContent = 'Start';
    showLineBtn.textContent = 'Show line';
  },
  returnToMenu() {
    resetGameToMenu();
  }
};
