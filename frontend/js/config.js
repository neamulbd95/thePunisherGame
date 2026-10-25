// Public, non-secret front-end configuration. Never put the Facebook App Secret,
// database URLs or session secrets here.
//
// Environment is picked from the hostname, so the same files deploy anywhere with no build step.
// Before going live, replace the production placeholders below (and the matching values in _headers).
(function () {
  var host = location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1';

  var local = {
    API_BASE_URL: 'http://localhost:3000/api/v1',
    FACEBOOK_APP_ID: '',                 // leave empty to use the mock login against a FACEBOOK_MOCK=true API
    FACEBOOK_GRAPH_API_VERSION: 'v25.0',
    DEV_MOCK_LOGIN: true
  };

  var production = {
    API_BASE_URL: 'https://api.the-bangla-punisher.cc/api/v1',   // Render API on a subdomain of the game's domain (same site, so cookies work)
    FACEBOOK_APP_ID: '',                              // PLACEHOLDER: your Meta app id (public)
    FACEBOOK_GRAPH_API_VERSION: 'v25.0',
    DEV_MOCK_LOGIN: false
  };

  // Facebook Login only works on domains registered in the Meta app. Cloudflare preview deployments
  // (*.pages.dev) are not registered, so login is disabled there instead of failing confusingly.
  var FACEBOOK_ALLOWED_HOSTS = ['the-bangla-punisher.cc'];   // hosts registered in the Meta app

  var cfg = isLocal ? local : production;
  cfg.FACEBOOK_LOGIN_ENABLED = !!cfg.FACEBOOK_APP_ID && (isLocal || FACEBOOK_ALLOWED_HOSTS.indexOf(host) !== -1);
  window.PUNISHER_CONFIG = Object.freeze(cfg);
})();
