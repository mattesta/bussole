const map = L.map('map', { zoomControl: true });
L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    maxZoom: 19,
    attribution: 'Tiles © Esri'
  }
).addTo(map);

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

const startBtn = document.getElementById('startBtn');
const showLineBtn = document.getElementById('showLineBtn');
const resetBtn = document.getElementById('resetBtn');
const searchBtn = document.getElementById('searchBtn');
const searchBox = document.getElementById('searchBox');
const statusEl = document.getElementById('status');
const suggestionsEl = document.getElementById('suggestions');
const SMOOTHING = 0.15; // 0.05 = molto fluido, 0.3 = reattivo
const distanceEl = document.getElementById('distance');


function setStatus(s) { statusEl.textContent = s; }

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
  const distance = 10000000; // 10.000 km
  const points = greatCirclePoints(lat, lon, heading, distance, 120);

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
  const d = distanceToLine(targetLatLng, lockedPoints);
  distanceEl.textContent =
    `Distanza dalla rotta: ${(d/1000).toFixed(1)} km`;
}

// gestione evento bussola
function handleOrientationEvent(e){
  let heading = e.webkitCompassHeading || e.alpha; // alpha fallback
  if (typeof heading !== 'number') return;
  const screenAngle = (screen.orientation && screen.orientation.angle) || 0;
  heading = ((heading - screenAngle + 360) % 360);
  smoothHeading = smoothAngle(smoothHeading, heading, SMOOTHING);
  lastHeading = smoothHeading;
  
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

        // abilita i pulsanti quando la posizione è pronta
        showLineBtn.disabled = false;
        resetBtn.disabled = false;

        if (!headingLine) {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          if (userMarker) userMarker.setLatLng([lat, lon]);
          else userMarker = L.marker([lat, lon]).addTo(map);
          map.setView([lat, lon], 16);
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


startBtn.addEventListener('click', start);

// mostra linea fissata
showLineBtn.addEventListener('click', () => {
  if (!lastPos || lastHeading === null) return;

  lineVisible = true;
  lineLocked = true;

  const lat = lastPos.coords.latitude;
  const lon = lastPos.coords.longitude;

  const points = greatCirclePoints(lat, lon, lastHeading, 10000000, 4000);
  lockedPoints = points;

  if (headingLine) headingLine.setLatLngs(points);
  else headingLine = L.polyline(points, { color: 'red', weight: 3 }).addTo(map);

  setStatus('Linea fissata');

  // aggiorna distanza se target già selezionato
  updateDistanceToTarget();
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
  setStatus('Linea nascosta. Premi "Mostra linea" per fissarla di nuovo.');
  distanceEl.textContent = '';
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
