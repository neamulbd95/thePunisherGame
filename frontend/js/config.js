// Public, non-secret front-end configuration. There are no third-party keys any more: players pick a nickname,
// and sharing a score on Facebook uses Facebook's own share window (no Facebook app, SDK or login).
//
// Environment is picked from the hostname, so the same files deploy anywhere with no build step.
(function () {
  var host = location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1';

  var cfg = isLocal
    ? { API_BASE_URL: 'http://localhost:3000/api/v1' }
    : { API_BASE_URL: 'https://api.the-bangla-punisher.cc/api/v1' }; // Render API on a subdomain of the game's domain (same site, so the cookie works)

  window.PUNISHER_CONFIG = Object.freeze(cfg);
})();
