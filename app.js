const map = L.map('map', { zoomControl: true });
L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    maxZoom: 19,
    attribution: 'Tiles © Esri'
  }
).addTo(map);

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

    // HARD → mostra input distanza
    if (gameMode === 'hard') {
      distanceInputWrap.style.display = 'block';
    } else {
      distanceInputWrap.style.display = 'none';
    }

    // 🧭 BUSSOLA solo EASY
    if (gameMode === 'easy') {
      compassContainer.classList.remove('hidden');
    } else {
      compassContainer.classList.add('hidden');
    }

    setStatus('Modalità: ' + gameMode);
  });
});



const startBtn = document.getElementById('startBtn');
const showLineBtn = document.getElementById('showLineBtn');
const resetBtn = document.getElementById('resetBtn');
const searchBtn = document.getElementById('searchBtn');
const searchBox = document.getElementById('searchBox');
const statusEl = document.getElementById('status');
const suggestionsEl = document.getElementById('suggestions');
const SMOOTHING = 0.07; // 0.05 = molto fluido, 0.3 = reattivo
const distanceEl = document.getElementById('distance');
const compassEl = document.getElementById('compassDial');
const compassContainer = document.getElementById('compass');
const timerCheckbox = document.getElementById('timerCheckbox');
const timerSettings = document.getElementById('timerSettings');
const timerDurationInput = document.getElementById('timerDuration');
const blurCheckbox = document.getElementById('blurCheckbox');
const timerBox = document.getElementById('timerBox');

timerCheckbox.addEventListener('change', () => {
  timerSettings.style.display = timerCheckbox.checked ? 'block' : 'none';
});

function setStatus(s) { statusEl.textContent = s; }

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

// calcola nuova posizione partendo da lat, lon, bearing e distanza
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

// genera punti lungo la grande circonferenza, con cubic easing per maggiore curvatura visibile
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

// aggiorna la linea in movimento (solo se lineVisible e non bloccata)
function updateLine(position, heading){
  if (!lineVisible || lineLocked) return;
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  const distance = 20000000; // 10.000 km
  const points = greatCirclePoints(lat, lon, heading, distance, 400);

  if (userMarker) userMarker.setLatLng([lat, lon]);
  else userMarker = L.marker([lat, lon]).addTo(map);

  if (headingLine) headingLine.setLatLngs(points);
  else headingLine = L.polyline(points, { color: 'red', weight: 2 }).addTo(map);
}

// richiesta permesso per bussola su iOS
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
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;

  const res = await fetch(url, {
    headers: { 'Accept-Language': 'it' }
  });
  const data = await res.json();

  showSuggestions(data);
}


// calcola distanza tra due punti sulla sfera
function distance(lat1, lon1, lat2, lon2){
  const R = 6378137;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180) *
            Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// distanza minima di un punto dalla linea
function distanceToLine(point, linePoints){
  if (!point || !linePoints) return null;
  let min = Infinity;
  for (const [lat, lon] of linePoints){
    const d = distance(point[0], point[1], lat, lon);
    if (d < min) min = d;
  }
  return min;
}

// aggiorna la distanza del target dalla linea
function updateDistanceToTarget() {
  if (!targetLatLng || !lockedPoints) return;

  let d;

  // 🔴 HARD → distanza dal punto finale
  if (gameMode === 'hard') {
    const lastPoint = lockedPoints[lockedPoints.length - 1];

    d = distance(
      targetLatLng[0], targetLatLng[1],
      lastPoint[0], lastPoint[1]
    );

    distanceEl.textContent =
      `Errore finale: ${(d/1000).toFixed(1)} km`;
  }

  // 🟡 MEDIO / 🟢 FACILE → distanza dalla rotta
  else {
    d = distanceToLine(targetLatLng, lockedPoints);

    distanceEl.textContent =
      `Distance from target: ${(d/1000).toFixed(1)} km`;
  }
}


// gestione evento bussola
function handleOrientationEvent(e) {

  // We only trust absolute orientation
  if (!e.absolute) return;

  if (typeof e.alpha !== "number") return;

  // Convert alpha to compass heading
  let heading = 360 - e.alpha;

  // Screen orientation correction
  const screenAngle =
    (screen.orientation && screen.orientation.angle) ||
    window.orientation ||
    0;

  heading = (heading - screenAngle + 360) % 360;

  // Normalize
  heading = (heading + 360) % 360;

  // Smooth using shortest path
  smoothHeading = smoothAngleShortest(smoothHeading, heading, SMOOTHING);
  lastHeading = smoothHeading;

  if (gameMode === "easy") {
    compassEl.style.transform = `rotate(${-smoothHeading}deg)`;
  }

  if (lastPos && lineVisible && !lineLocked) {
    updateLine(lastPos, smoothHeading);
  }
}

// avvio del tracking
function start() {
  startBtn.disabled = true;
  setStatus('Requesting permissions...');

  requestDeviceOrientationPermission().then(ok=>{
    if (!ok) setStatus('Device orientation permission denied (compass may not work).');
    else setStatus('Waiting for location & orientation...');

    window.addEventListener('deviceorientation', handleOrientationEvent, true);

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(pos=>{
        lastPos = pos;
        setStatus('Position acquired. Move phone to set direction.');
        if (timerEnabled && roundActive && !timerInterval) {
          startTimer();
        }
        // abilita i pulsanti quando la posizione è pronta
        showLineBtn.disabled = false;
        resetBtn.disabled = false;

        if (!headingLine) {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          if (userMarker) userMarker.setLatLng([lat, lon]);
          else userMarker = L.marker([lat, lon]).addTo(map);
          map.setView([lat, lon], 16);
          if (blurEnabled) {
            showBlurCircle(lat, lon);
          }
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
  const lat = parseFloat(r.lat);
  const lon = parseFloat(r.lon);

  targetLatLng = [lat, lon];
  searchBox.value = r.display_name;
  suggestionsEl.style.display = 'none';

  if (targetMarker) targetMarker.setLatLng(targetLatLng);
  else targetMarker = L.marker(targetLatLng).addTo(map);

  //map.panTo(targetLatLng);

  updateDistanceToTarget();
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
});


// mostra linea fissata
showLineBtn.addEventListener('click', () => {
  if (lineLocked) return;
  roundActive = false;
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

  // 🔴 HARD → usa distanza inserita
  if (gameMode === 'hard') {
    const km = parseFloat(distanceInput.value);
    if (!km) {
      alert("Inserisci una distanza!");
      return;
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
});

// reset linea
resetBtn.addEventListener('click', () => {
  if (headingLine) {
    map.removeLayer(headingLine);
    headingLine = null;
  }
  lineLocked = false;
  lockedPoints = null;
  lineVisible = false;
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

// ricerca target
searchBtn.addEventListener('click', async () => {
  const q = searchBox.value;
  if (!q) return;

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.length) return;

  const lat = parseFloat(data[0].lat);
  const lon = parseFloat(data[0].lon);

  targetLatLng = [lat, lon];

  if (targetMarker) targetMarker.setLatLng(targetLatLng);
  else targetMarker = L.marker(targetLatLng, { color: 'blue' }).addTo(map);

  //map.panTo(targetLatLng);

  // aggiorna distanza se linea fissata
  updateDistanceToTarget();
});

// cleanup on unload
window.addEventListener('beforeunload', ()=> {
  if (watchId) navigator.geolocation.clearWatch(watchId);
  window.removeEventListener('deviceorientation', handleOrientationEvent);
});

searchBox.addEventListener('input', () => {
  const q = searchBox.value.trim();

  clearTimeout(searchTimeout);

  if (q.length < 3) {
    suggestionsEl.style.display = 'none';
    return;
  }

  searchTimeout = setTimeout(() => fetchSuggestions(q), 300);
});
