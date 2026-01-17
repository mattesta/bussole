const map = L.map('map', { zoomControl: true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap'
}).addTo(map);

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

let movingLine = null;   // linea che segue il telefono
let lockedLine = null;   // linea fissata

const startBtn = document.getElementById('startBtn');
const showLineBtn = document.getElementById('showLineBtn');
const resetBtn = document.getElementById('resetBtn');
const searchBtn = document.getElementById('searchBtn');
const searchBox = document.getElementById('searchBox');
const statusEl = document.getElementById('status');

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
  if (!lineVisible) return;
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
  setStatus(`Distanza dalla rotta: ${(d/1000).toFixed(1)} km`);
}

// gestione evento bussola
function handleOrientationEvent(e){
  let heading = e.webkitCompassHeading || e.alpha; // alpha fallback
  if (typeof heading !== 'number') return;
  const screenAngle = (screen.orientation && screen.orientation.angle) || 0;
  heading = ((heading - screenAngle + 360) % 360);
  lastHeading = heading;
  if (lastPos && lineVisible && !lineLocked) {
    updateLine(lastPos, heading);
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

startBtn.addEventListener('click', start);

// mostra linea fissata
showLineBtn.addEventListener('click', () => {
  if (!lastPos || lastHeading === null) return;

  const lat = lastPos.coords.latitude;
  const lon = lastPos.coords.longitude;

  const points = greatCirclePoints(lat, lon, lastHeading, 10000000, 120);
  lockedPoints = points;

  if (lockedLine) lockedLine.setLatLngs(points);
  else lockedLine = L.polyline(points, { color: 'red', weight: 3 }).addTo(map);

  // rimuovo la linea in movimento
  if (movingLine) {
    map.removeLayer(movingLine);
    movingLine = null;
  }

  lineVisible = false;   // la linea in movimento non deve più apparire
  lineLocked = true;

  setStatus('Linea fissata');
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
