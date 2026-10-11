// A 400 m neighbourhood projected by each renderer; never intercepts gestures.
window.BussolePlayerBlur = {
  create(container, project, destination) {
    let element = null;
    return {
      show(lat, lon) {
        const centre = project([lat, lon]);
        let radius = 0;
        for (const bearing of [0, 90, 180, 270]) {
          const point = destination(lat, lon, bearing, 400);
          // Keep neighbourhoods crossing the date line in the same world copy.
          point[1] = lon + ((point[1] - lon + 540) % 360 - 180);
          const edge = project(point);
          radius = Math.max(radius, Math.hypot(edge.x - centre.x, edge.y - centre.y));
        }
        if (!Number.isFinite(centre.x + centre.y + radius) || radius <= 0) return this.hide();
        if (!element) {
          element = document.createElement('div');
          element.className = 'blur-circle';
          element.setAttribute('aria-hidden', 'true');
          container.appendChild(element);
        }
        element.style.left = `${centre.x}px`;
        element.style.top = `${centre.y}px`;
        element.style.width = element.style.height = `${radius * 2}px`;
      },
      hide() {
        element?.remove();
        element = null;
      }
    };
  }
};
