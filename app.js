const map = L.map('map', { zoomControl: true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap'
}).addTo(map);

let userMarker = null;
let staticLine = null;
let watchId = null;
let lastPos = null;        // current live position
let snapshotPos = null;    // fixed start pos for created line
let lastHeading = null;    // most recent heading value

const startBtn = document.getElementById('startBtn');
const createBtn = document.getElementById('createBtn');
const statusEl = document.getElementById('status');

function setStatus(s){ statusEl.textContent = s; }

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

// Update live marker only (line is static once created)
function updateMarker(position){
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  if (userMarker) userMarker.setLatLng([lat, lon]);
  else userMarker = L.marker([lat, lon]).addTo(map);
  if (!map.getBounds().contains([lat, lon])) map.setView([lat, lon], 16);
}

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

function handleOrientationEvent(e){
  let heading = e.alpha;
  if (typeof heading !== 'number') return;
  const screenAngle = (screen.orientation && screen.orientation.angle) || 0;
  heading = (heading - screenAngle + 360) % 360;
  lastHeading = heading;
  // update HUD with heading but do NOT move any existing line
  setStatus('Heading: ' + Math.round(heading) + '°' + (lastPos ? ' • position available' : ''));
}

function createLine(){
  if (!lastHeading) { setStatus('No heading available. Press Enable Compass and orient phone.'); return; }
  const pos = snapshotPos || lastPos;
  if (!pos) { setStatus('No position available. Allow location and try again.'); return; }
  // snapshot the start so the line does NOT move afterwards
  snapshotPos = { coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } };
  const lat = snapshotPos.coords.latitude;
  const lon = snapshotPos.coords.longitude;
  const distance = 20000000; // 20,000 km - very long
  const dest = destLatLng(lat, lon, lastHeading, distance);
  if (staticLine) map.removeLayer(staticLine);
  staticLine = L.polyline([[lat, lon], dest], { color: 'red', weight: 4, opacity: 0.9 }).addTo(map);
  setStatus('Line created at ' + Math.round(lastHeading) + '°');
  // keep marker live but do not alter the created line after this
}

function startOrientation(){
  startBtn.disabled = true;
  setStatus('Requesting compass permission...');
  requestDeviceOrientationPermission().then(ok=>{
    if (!ok) setStatus('Compass permission denied; heading may not work.');
    else setStatus('Compass enabled; rotate phone then press "Create Line".');
    window.addEventListener('deviceorientation', handleOrientationEvent, true);
  });
}

// request and show location on load
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(pos=>{
    lastPos = pos;
    updateMarker(pos);
    setStatus('Position acquired. Press "Enable Compass" to allow heading.');
    // start watching to keep marker live (optional)
    watchId = navigator.geolocation.watchPosition(p=>{
      lastPos = p;
      updateMarker(p);
    }, err=>{
      console.warn('watchPosition error', err);
    }, { enableHighAccuracy: true, maximumAge: 1000 });
  }, err=>{
    setStatus('Geolocation error: ' + err.message);
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
} else {
  setStatus('Geolocation not supported.');
}

startBtn.addEventListener('click', startOrientation);
createBtn.addEventListener('click', createLine);

window.addEventListener('beforeunload', ()=> {
  if (watchId) navigator.geolocation.clearWatch(watchId);
  window.removeEventListener('deviceorientation', handleOrientationEvent);
});
