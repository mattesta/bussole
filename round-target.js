// Pick a fresh catalogue target before opening the next-round lobby.
window.BussoleRoundTargets = {
  searchEasterEgg(query) {
    if (!query.trim().toLowerCase().includes('fanculo')) return null;
    // Uniformly sample the sphere, including places outside the catalogue.
    return {lat: Math.asin(2*Math.random()-1)*180/Math.PI, lon: Math.random()*360-180, label: 'Fanculo'};
  },
  next(current) {
    const catalogue = window.BUSSOLE_TARGETS || [];
    const candidates = catalogue.filter(place => place.lat !== current?.lat || place.lon !== current?.lon);
    const pool = candidates.length ? candidates : catalogue;
    if (!pool.length) return null;
    const place = pool[Math.floor(Math.random() * pool.length)];
    return { lat: place.lat, lon: place.lon, label: `${place.name}, ${place.country}` };
  }
};
