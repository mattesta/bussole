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


const startBtn = document.getElementById('startBtn');
const statusEl = document.getElementById('status');
const showLineBtn = document.getElementById('showLineBtn');

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

function greatCirclePoints(lat, lon, bearing, distance, steps){
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const f = t * t * t; // cubic ease-in
    const d = distance * f;
    points.push(destLatLng(lat, lon, bearing, d));
  }
  return points;
}

function updateLine(position, heading){
  if (!lineVisible) return;
  if (lineLocked) return;
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  const distance = 10000000; // prova 2.000 km
  const points = greatCirclePoints(lat, lon, heading, distance, 120);
  if (userMarker) userMarker.setLatLng([lat, lon]);
  else userMarker = L.marker([lat, lon]).addTo(map);
  if (headingLine) headingLine.setLatLngs(points);
  else headingLine = L.polyline(points, { color: 'red', weight: 2 }).addTo(map);
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
  return true; // non-iOS or already allowed
}

function handleOrientationEvent(e){
  // alpha is rotation around Z axis (degrees). Might need calibration per device.
  let heading = null;
  heading = e.webkitCompassHeading;
  if (typeof heading !== 'number') return;
  // adjust for screen orientation
  const screenAngle = (screen.orientation && screen.orientation.angle) || 0;
  heading = ((heading - screenAngle + 360) % 360);
  lastHeading = heading;
  // if (heading === null) return; // togliere?
  if (lastPos && lineVisible && !lineLocked) {
    updateLine(lastPos, heading);
  }
}

function start() {
  startBtn.disabled = true;
  setStatus('Requesting permissions...');
  // request orientation permission for iOS on user gesture
  requestDeviceOrientationPermission().then(ok=>{
    if (!ok) setStatus('Device orientation permission denied (compass may not work).');
    else setStatus('Waiting for location & orientation...');
    window.addEventListener('deviceorientation', handleOrientationEvent, true);
    // watch position
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(pos=>{
        lastPos = pos;
        setStatus('Position acquired. Move phone to set direction.');
        // if we have an orientation event fired earlier, updateLine will run there
        // but if no orientation yet, draw a small circle
        if (!headingLine) {
          const lat = pos.coords.latitude, lon = pos.coords.longitude;
          if (userMarker) userMarker.setLatLng([lat,lon]);
          else userMarker = L.marker([lat,lon]).addTo(map);
          map.setView([lat,lon], 16);
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

showLineBtn.addEventListener('click', () => {
  if (!lastPos) return;

  lineVisible = true;
  lineLocked = true;

  const lat = lastPos.coords.latitude;
  const lon = lastPos.coords.longitude;

  const points = greatCirclePoints(lat, lon, lastHeading, 10000000, 120);
  lockedPoints = points;

  if (headingLine) {
    headingLine.setLatLngs(points);
  } else {
    headingLine = L.polyline(points, { color: 'red', weight: 3 }).addTo(map);
  }

  setStatus('Linea fissata');
});

// cleanup if needed
window.addEventListener('beforeunload', ()=> {
  if (watchId) navigator.geolocation.clearWatch(watchId);
  window.removeEventListener('deviceorientation', handleOrientationEvent);
});
