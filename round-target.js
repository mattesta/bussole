// Pick a fresh catalogue target before opening the next-round lobby.
window.BussoleRoundTargets = {
  next(current) {
    const catalogue = window.BUSSOLE_TARGETS || [];
    const candidates = catalogue.filter(place => place.lat !== current?.lat || place.lon !== current?.lon);
    const pool = candidates.length ? candidates : catalogue;
    if (!pool.length) return null;
    const place = pool[Math.floor(Math.random() * pool.length)];
    return { lat: place.lat, lon: place.lon, label: `${place.name}, ${place.country}` };
  }
};
