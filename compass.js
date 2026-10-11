/* Shared geographic heading reader for the 2D and 3D games. */
(function (root) {
  const radians = Math.PI / 180;
  const normalize = value => (value % 360 + 360) % 360;
  function read(event, screenAngle = 0) {
    // Safari supplies a native compass heading. Keep this established path.
    if (Number.isFinite(event.webkitCompassHeading) && event.webkitCompassHeading >= 0) {
      return { heading: normalize(event.webkitCompassHeading + screenAngle), source: 'native', reason: null };
    }
    // Chrome's ordinary deviceorientation event may measure rotation relative
    // to an arbitrary initial pose. It cannot tell us where north is.
    if (event.type !== 'deviceorientationabsolute' && event.absolute !== true) {
      return { heading: null, source: 'relative', reason: 'relative' };
    }
    if (![event.alpha, event.beta, event.gamma].every(Number.isFinite)) {
      return { heading: null, source: 'absolute', reason: 'missing' };
    }
    const a = event.alpha * radians, b = event.beta * radians, g = event.gamma * radians;
    const s = Math.sin(screenAngle * radians), c = Math.cos(screenAngle * radians);
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
    // Rotate the screen's TOP edge [sin(screenAngle), cos(screenAngle), 0]
    // with the W3C intrinsic Z-X-Y rotation. Project that vector horizontally.
    // The old formula projected the screen's back normal; near horizontal it
    // vanished, so tiny tilts could cause 180-degree flips and endless spins.
    const east = (ca * cg - sa * sb * sg) * s - sa * cb * c;
    const north = (sa * cg + ca * sb * sg) * s + ca * cb * c;
    if (Math.hypot(east, north) < 0.15) {
      return { heading: null, source: 'absolute', reason: 'tilted' };
    }
    return { heading: normalize(Math.atan2(east, north) / radians), source: 'absolute', reason: null };
  }
  function screenAngle() {
    return Number.isFinite(root.screen?.orientation?.angle)
      ? root.screen.orientation.angle : (Number.isFinite(root.orientation) ? root.orientation : 0);
  }
  function createTracker({ onHeading, onStatus = () => {} }) {
    let active = false, timer = null, lastAbsoluteAt = -Infinity, hasHeading = false;
    function handle(event) {
      const reading = read(event, screenAngle());
      if (reading.reason === 'relative') return;
      const absoluteEvent = event.type === 'deviceorientationabsolute';
      if (!absoluteEvent && reading.source !== 'native' && Date.now() - lastAbsoluteAt < 1000) return;
      if (absoluteEvent && reading.heading !== null) lastAbsoluteAt = Date.now();
      if (reading.heading === null) {
        if (reading.reason === 'tilted') { clearTimeout(timer); onStatus('tilted'); }
        return;
      }
      hasHeading = true;
      clearTimeout(timer);
      onHeading(reading.heading, reading.source);
    }
    return {
      start() {
        if (active) return;
        active = true; hasHeading = false; lastAbsoluteAt = -Infinity;
        root.addEventListener('deviceorientationabsolute', handle, true);
        root.addEventListener('deviceorientation', handle, true);
        timer = setTimeout(() => { if (active && !hasHeading) onStatus('unavailable'); }, 4000);
      },
      stop() {
        active = false;
        root.removeEventListener('deviceorientationabsolute', handle, true);
        root.removeEventListener('deviceorientation', handle, true);
        clearTimeout(timer);
      }
    };
  }
  root.BussoleCompass = { read, createTracker };
})(typeof window === 'undefined' ? globalThis : window);
