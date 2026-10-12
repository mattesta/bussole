// Summary geometry follows the game’s spherical calculations.
(function(root){
const EARTH_RADIUS=6378137;
function destLatLng(lat, lon, bearingDeg, distanceMeters) {
  const bearing = bearingDeg * Math.PI / 180;
  const lat1 = lat * Math.PI / 180;
  const lon1 = lon * Math.PI / 180;
  const angularDistance = distanceMeters / EARTH_RADIUS;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );
  return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
}
function greatCirclePoints(lat, lon, bearing, distanceMeters, steps = Math.min(20000, Math.max(400, Math.ceil(Math.abs(distanceMeters) / 25000)))) {
  const points = [];
  for (let index = 0; index <= steps; index++) {
    const fraction = index / steps;
    points.push(destLatLng(lat, lon, bearing, distanceMeters * fraction));
  }
  return points;
}
function toUnitVector([lat, lon]) {
  const phi = lat * Math.PI / 180;
  const lambda = lon * Math.PI / 180;
  const cosPhi = Math.cos(phi);
  return [cosPhi * Math.cos(lambda), cosPhi * Math.sin(lambda), Math.sin(phi)];
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
function normalizeVector(vector) {
  const length = Math.hypot(...vector);
  return length < 1e-12 ? null : vector.map(value => value / length);
}
function angleBetween(a, b) {
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
}
function vectorToLatLng(vector) {
  return [
    Math.atan2(vector[2], Math.hypot(vector[0], vector[1])) * 180 / Math.PI,
    Math.atan2(vector[1], vector[0]) * 180 / Math.PI
  ];
}
function nearestPointOnLine(point, linePoints) {
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

  for (let index = 0; index < linePoints.length - 1; index++) {
    const start = toUnitVector(linePoints[index]);
    const end = toUnitVector(linePoints[index + 1]);
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
    const isOnSegment = Math.abs(
      angleBetween(start, candidate) + angleBetween(candidate, end) - segmentAngle
    ) < 1e-7;
    if (isOnSegment) consider(candidate);
  }

  return {
    point: vectorToLatLng(bestVector),
    distance: bestAngle * EARTH_RADIUS
  };
}
function greatCircleArcBetween(from, to) {
  const start = toUnitVector(from);
  const end = toUnitVector(to);
  const omega = angleBetween(start, end);
  const sinOmega = Math.sin(omega);
  if (omega < 1e-10 || Math.abs(sinOmega) < 1e-10) return [from, to];

  const steps = Math.min(180, Math.max(20, Math.ceil(omega * 180 / Math.PI * 2)));
  const points = [];
  for (let index = 0; index <= steps; index++) {
    const fraction = index / steps;
    const startWeight = Math.sin((1 - fraction) * omega) / sinOmega;
    const endWeight = Math.sin(fraction * omega) / sinOmega;
    const vector = normalizeVector([
      startWeight * start[0] + endWeight * end[0],
      startWeight * start[1] + endWeight * end[1],
      startWeight * start[2] + endWeight * end[2]
    ]);
    const latLng = vectorToLatLng(vector);
    if (points.length) {
      const previousLon = points[points.length - 1][1];
      while (latLng[1] - previousLon > 180) latLng[1] -= 360;
      while (latLng[1] - previousLon < -180) latLng[1] += 360;
    }
    points.push(latLng);
  }
  return points;
}
function measure(submission,target,mode){
 const route=greatCirclePoints(submission.lat,submission.lon,submission.heading,submission.distanceMeters);
 const destination=[target.lat,target.lon];
 const contact=mode==='hard'?route.at(-1):nearestPointOnLine(destination,route).point;
 const errorMeters=angleBetween(toUnitVector(contact),toUnitVector(destination))*EARTH_RADIUS;
 const initialDistance=angleBetween(toUnitVector([submission.lat,submission.lon]),toUnitVector(destination))*EARTH_RADIUS;
 return {route,errorArc:greatCircleArcBetween(contact,destination),contact,errorMeters,points:root.BussoleScoring.points(errorMeters,initialDistance)};
}
root.BussoleReportGeometry={measure,toUnitVector,vectorToLatLng,normalizeVector,angleBetween};
})(window);
