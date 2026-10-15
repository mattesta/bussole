// DOM markers normally follow camera events. Globe projection can finish
// adjusting during rendering, after the last move event has already fired.
(function(root) {
  function attach(map, getMarkers) {
    const sync = () => {
      for (const marker of getMarkers()) {
        if (marker) marker.setLngLat(marker.getLngLat());
      }
    };
    // Use the public Marker API after each actual draw. This does not move the
    // camera or request another frame, so a resting globe stays at rest.
    map.on('render', sync);
    map.on('remove', () => map.off('render', sync));
  }
  root.BussoleGlobeMarkerSync = {attach};
})(window);
