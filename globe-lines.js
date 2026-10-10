/* Draw geographic lines without routing them through Mercator vector tiles.
 * The custom layer receives MapLibre's camera matrices on every render, so
 * the overlay follows pan, zoom, bearing and the globe/Mercator transition.
 */
(function (root) {
  const radians = Math.PI / 180;
  function vertex([lat, lon]) {
    const phi = lat * radians, lambda = lon * radians;
    return {
      sphere: [Math.sin(lambda) * Math.cos(phi), Math.sin(phi), Math.cos(lambda) * Math.cos(phi), 1],
      // Only the flat fallback needs a finite latitude at the exact poles.
      mercator: [(lon + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + Math.max(-89.999999, Math.min(89.999999, lat)) * radians / 2)) / Math.PI) / 2, 0, 1]
    };
  }
  function multiply(matrix, point) {
    return [0, 1, 2, 3].map(row => point.reduce((sum, value, column) => sum + matrix[column * 4 + row] * value, 0));
  }
  function project(point, data, worldOffset = 0) {
    const transition = data.projectionTransition;
    const flat = point.mercator.slice();
    flat[0] += worldOffset;
    if (transition === 0) return multiply(data.mainMatrix, flat);
    const globe = multiply(data.mainMatrix, point.sphere);
    const plane = data.clippingPlane;
    globe[2] = (1 - (point.sphere[0] * plane[0] + point.sphere[1] * plane[1] + point.sphere[2] * plane[2] + plane[3])) * globe[3];
    if (transition > 0.999) return globe;
    const fallback = multiply(data.fallbackMatrix, flat);
    const result = globe.map((value, index) => index === 2
      ? value * Math.max(0, (transition - 0.2) / 0.8)
      : fallback[index] * (1 - transition) + value * transition);
    return result;
  }
  // Clip in homogeneous coordinates before dividing by w: this also hides
  // the far side of the globe, rather than drawing lines through the planet.
  function clipSegment(first, second) {
    let start = 0, end = 1;
    for (const plane of [p => p[3] - p[0], p => p[3] + p[0], p => p[3] - p[1], p => p[3] + p[1], p => p[3] - p[2], p => p[3] + p[2], p => p[3] - 1e-9]) {
      const a = plane(first), b = plane(second);
      if (a < 0 && b < 0) return null;
      if (a < 0) start = Math.max(start, a / (a - b));
      if (b < 0) end = Math.min(end, a / (a - b));
      if (start > end) return null;
    }
    const at = t => first.map((value, index) => value + (second[index] - value) * t);
    return [at(start), at(end)];
  }
  function segments(points) {
    const result = [];
    for (let i = 1; i < points.length; i++) {
      const first = vertex(points[i - 1]), second = vertex(points[i]);
      // Unwrap each short segment, then choose its world copy at render time.
      // No discontinuity at +/-180, even on routes longer than a revolution.
      second.mercator[0] += Math.round(first.mercator[0] - second.mercator[0]);
      result.push([first, second]);
    }
    return result;
  }
  function createLayer(id = 'geographic-lines') {
    return {
      id, type: 'custom', renderingMode: '2d', lines: new Map(),
      onAdd(map) {
        this.map = map;
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
        this.canvas.setAttribute('aria-hidden', 'true');
        map.getCanvasContainer().appendChild(this.canvas);
        this.context = this.canvas.getContext('2d');
      },
      onRemove() { this.canvas.remove(); },
      setLine(key, points, color, width = 3.5, shadow = false) {
        this.lines.set(key, { segments: segments(points), color, width, shadow });
        this.map.triggerRepaint();
      },
      removeLine(key) { this.lines.delete(key); this.map.triggerRepaint(); },
      render(gl, args) {
        const width = this.map.getCanvas().clientWidth, height = this.map.getCanvas().clientHeight;
        const ratio = window.devicePixelRatio || 1;
        if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
          this.canvas.width = Math.round(width * ratio);
          this.canvas.height = Math.round(height * ratio);
        }
        const context = this.context;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        context.lineCap = 'round'; context.lineJoin = 'round';
        const data = args.defaultProjectionData;
        const centerX = (this.map.getCenter().lng + 180) / 360;
        for (const line of this.lines.values()) {
          context.beginPath();
          let previousEnd = null;
          for (const pair of line.segments) {
            const offset = Math.round(centerX - (pair[0].mercator[0] + pair[1].mercator[0]) / 2);
            const clipped = clipSegment(project(pair[0], data, offset), project(pair[1], data, offset));
            if (!clipped) { previousEnd = null; continue; }
            const screen = clipped.map(p => [(p[0] / p[3] + 1) * width / 2, (1 - p[1] / p[3]) * height / 2]);
            if (!previousEnd || Math.hypot(screen[0][0] - previousEnd[0], screen[0][1] - previousEnd[1]) > 0.1) context.moveTo(...screen[0]);
            context.lineTo(...screen[1]);
            previousEnd = screen[1];
          }
          if (line.shadow) {
            context.strokeStyle = 'rgba(0,0,0,.72)'; context.lineWidth = line.width + 3; context.stroke();
          }
          context.strokeStyle = line.color; context.lineWidth = line.width; context.stroke();
        }
      }
    };
  }
  root.BussoleGlobeLines = { createLayer, vertex, project, clipSegment, segments };
})(typeof window === 'undefined' ? globalThis : window);
