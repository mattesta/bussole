// Public rooms share this reduced result, never the submitted location/bearing.
(function (root) {
  const R = 6378137, radians = Math.PI / 180;
  const HALF_LENGTH = 300000, SAFE_DISTANCE = 500000, MIN_POINTS = 200;
  const vector = ([lat, lon]) => [Math.cos(lat * radians) * Math.cos(lon * radians), Math.cos(lat * radians) * Math.sin(lon * radians), Math.sin(lat * radians)];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const normalize = a => { const length = Math.hypot(...a); return length > 1e-12 ? a.map(v => v / length) : null; };
  const coordinate = a => [Math.atan2(a[2], Math.hypot(a[0], a[1])) / radians, Math.atan2(a[1], a[0]) / radians];
  const wrapped = ([lat, lon]) => [lat, ((lon + 180) % 360 + 360) % 360 - 180];

  function publish(submission, target, mode, geo) {
    const origin = [submission.lat, submission.lon], destination = [target.lat, target.lon];
    const route = geo.route(submission);
    const contact = mode === 'hard' ? route.at(-1) : geo.nearest(destination, route).point;
    const errorArc = geo.arc(contact, destination);
    const points = root.BussoleScoring.points(geo.distance(contact, destination), geo.distance(origin, destination));
    const result = { version: 1, points };
    if (points < MIN_POINTS) return result;

    // Use a short initial segment to determine the great-circle plane even
    // when a Hard route is longer than one complete revolution.
    const next = geo.destination(submission.lat, submission.lon, submission.heading, 1000);
    const axis = normalize(cross(vector(origin), vector(next)));
    if (!axis) return result;
    const center = vector(contact), tangent = cross(axis, center);
    const shortRoute = Array.from({ length: 61 }, (_, index) => {
      const angle = ((index / 60) * 2 - 1) * HALF_LENGTH / R;
      return coordinate(center.map((value, component) => value * Math.cos(angle) + tangent[component] * Math.sin(angle)));
    });
    // Check whole spherical segments, including the error arc and the target;
    // checking just the contact or sampled vertices could expose the origin.
    if (geo.nearest(origin, shortRoute).distance < SAFE_DISTANCE || geo.nearest(origin, errorArc).distance < SAFE_DISTANCE) return result;
    result.route = shortRoute.map(wrapped);
    result.errorArc = errorArc.map(wrapped);
    return result;
  }

  function unwrap(points) {
    const result = [];
    for (const point of points) {
      const next = [...point];
      if (result.length) {
        const previous = result.at(-1)[1];
        while (next[1] - previous > 180) next[1] -= 360;
        while (next[1] - previous < -180) next[1] += 360;
      }
      result.push(next);
    }
    return result;
  }

  function fadeParts(route) {
    const points = unwrap(route), parts = [];
    for (let start = 0; start < points.length - 1; start += 5) {
      const end = Math.min(start + 5, points.length - 1);
      const edge = 1 - Math.abs(2 * ((start + end) / 2) / (points.length - 1) - 1);
      const opacity = 0.9 * Math.min(1, edge * 3) ** 2;
      parts.push({ points: points.slice(start, end + 1), opacity });
    }
    return parts;
  }
  function alpha(hex, opacity) {
    return `rgba(${[1,3,5].map(index => parseInt(hex.slice(index, index + 2), 16)).join(',')},${opacity})`;
  }
  function hasGeometry(result) {
    return Array.isArray(result.route) && result.route.length === 61 && Array.isArray(result.errorArc) && result.errorArc.length >= 2 && result.errorArc.length <= 181 &&
      [...result.route, ...result.errorArc].every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite));
  }
  root.BussolePublicPrivacy = { publish, unwrap, fadeParts, alpha, hasGeometry, HALF_LENGTH, SAFE_DISTANCE, MIN_POINTS };
})(typeof window === 'undefined' ? globalThis : window);
