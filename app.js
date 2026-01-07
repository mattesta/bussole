const map = L.map('map', { zoomControl: true, worldCopyJump: true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap'
}).addTo(map);

let userMarker = null;
let previewLine = null; // live preview while aiming
let staticLine = null;  // final fixed line after creation
let watchId = null;
let lastPos = null;
let rawHeading = null;          // latest raw heading from event
let filteredHeading = null;     // smoothed heading
let lineCreated = false;

const startBtn = document.getElementById('startBtn');
const createBtn = document.getElementById('createBtn');
const statusEl = document.getElementById('status');

createBtn.disabled = true;

function setStatus(s){ statusEl.textContent = s; }

function destLatLng(lat, lon, bearingDeg, distanceMeters){
  const R = 6378137;
  const brng = (bearingDeg * Math.PI) / 180;
  const d = distanceMeters;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1)*Math.cos(d/R) + Math.cos(lat1)*Math.sin(d/R)*Math.cos(brng));
  const lon2 = lon1 + Math.atan2(Math.sin(brng)*Math.sin(d/R)*Math.cos(lat1), Math.cos(d/R)-Math.sin(lat1)*Math.sin(lat2));
  return [lat2 * 180/Math.PI, lon2 * 180/Math.PI];
}

function updateMarker(position){
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  if (userMarker) userMarker.setLatLng([lat, lon]);
  else userMarker = L.marker([lat, lon]).addTo(map);
  if (!map.getBounds().contains([lat, lon])) map.setView([lat, lon], 16);
}

// Robust heading extraction across devices
function getHeadingFromEvent(e){
  if (typeof e.webkitCompassHeading === 'number') return e.webkitCompassHeading; // iOS native compass
  if (typeof e.alpha !== 'number') return null;
  const screenAngle = (screen.orientation && screen.orientation.angle) || 0;
  // Convert device alpha to compass heading (0 = north). This avoids common inversion.
  return (360 - e.alpha - screenAngle + 360) % 360;
}

// Smooth heading to avoid bouncing between two angles
function smoothHeading(raw, prevFiltered, alpha = 0.18){
  if (prevFiltered == null) return raw; // first sample is immediate
  // compute smallest angular difference in [-180,180]
  let delta = ((raw - prevFiltered + 540) % 360) - 180;
  const filtered = (prevFiltered + delta * alpha + 360) % 360;
  return filtered;
}

function updatePreviewLine(pos, heading){
  if (!pos || heading == null) return;
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  const distance = 20000000; // ~20,000 km — very long
  const dest = destLatLng(lat, lon, heading, distance);
  if (previewLine) previewLine.setLatLngs([[lat, lon], dest]);
  else previewLine = L.polyline([[lat, lon], dest], { color: 'orange', weight: 2, dashArray: '8 8', opacity: 0.9 }).addTo(map);
}

function handleOrientationEvent(e){
  if (lineCreated) return; // ignore after creation
  const raw = getHeadingFromEvent(e);
  if (raw === null) return;
  rawHeading = raw;
  // smooth and avoid bouncing across 0/360 by using angular diff smoothing
  const newFiltered = smoothHeading(rawHeading, filteredHeading, 0.18);
  // avoid tiny jitter updates: only update if significant change (deg)
  const change = filteredHeading == null ? 360 : Math.abs(((newFiltered - filteredHeading + 540) % 360) - 180);
  filteredHeading = newFiltered;
  if (lastPos && change > 0.3) { // update preview only if changed >0.3°
    updatePreviewLine(lastPos, filteredHeading);
  }
  // enable create button when both pos and a stable heading exist
  createBtn.disabled = !(lastPos && filteredHeading != null);
  setStatus('Heading: ' + Math.round(filteredHeading) + '°' + (lastPos ? ' • position ready' : ''));
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

function createLine(){
  if (lineCreated) return;
  const headingToUse = filteredHeading || rawHeading;
  if (!headingToUse) { setStatus('No heading. Enable compass and point phone.'); return; }
  if (!lastPos) { setStatus('No position. Allow location and try again.'); return; }
  const lat = lastPos.coords.latitude;
  const lon = lastPos.coords.longitude;
  // If you see the line in the opposite direction, uncomment the next line:
  // const finalHeading = (headingToUse + 180) % 360;
  const finalHeading = headingToUse;
  const distance = 20000000;
  const dest = destLatLng(lat, lon, finalHeading, distance);
  if (staticLine) map.removeLayer(staticLine);
  staticLine = L.polyline([[lat, lon], dest], { color: 'red', weight: 4, opacity: 0.95 }).addTo(map);
  if (previewLine) { map.removeLayer(previewLine); previewLine = null; }
  lineCreated = true;
  createBtn.disabled = true;
  startBtn.disabled = true;
  window.removeEventListener('deviceorientation', handleOrientationEvent, true);
  setStatus('Line created at ' + Math.round(finalHeading) + '°');
}

// start orientation capturing on user gesture
function startOrientation(){
  startBtn.disabled = true;
  setStatus('Requesting compass permission...');
  requestDeviceOrientationPermission().then(ok=>{
    if (!ok) setStatus('Compass permission denied; heading may not work.');
    else setStatus('Compass enabled; rotate phone then press "Create Line".');
    // listen at capture phase to get more consistent events on some devices
    window.addEventListener('deviceorientation', handleOrientationEvent, true);
  });
}

// load current position and start watch to keep marker live
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(pos=>{
    lastPos = pos;
    updateMarker(pos);
    setStatus('Position acquired. Press "Enable Compass" to allow heading.');
    watchId = navigator.geolocation.watchPosition(p=>{
      lastPos = p;
      updateMarker(p);
      // update preview if heading available and not created
      if (filteredHeading != null && !lineCreated) updatePreviewLine(lastPos, filteredHeading);
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
