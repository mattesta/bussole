// Every room shares points only; even partial routes can constrain a location.
(function (root) {
  const R = 6378137, radians = Math.PI / 180;
  const HALF_LENGTH = 300000, SAFE_DISTANCE = 500000, MIN_POINTS = 200;

  function publish(submission, target, mode, geo) {
    const origin = [submission.lat, submission.lon], destination = [target.lat, target.lon];
    const route = geo.route(submission);
    const contact = mode === 'hard' ? route.at(-1) : geo.nearest(destination, route).point;
    const errorArc = geo.arc(contact, destination);
    const points = root.BussoleScoring.points(geo.distance(contact, destination), geo.distance(origin, destination));
    const result = { version: 1, points };
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
