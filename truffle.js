module.exports = {
  build: {
    "index.html": "index.html",
    "portal.html": "portal.html",

    "app.js": ["js/portal.js"],
    "js/portal.js": ["js/portal.js"],
    "js/index.js": ["js/index.js"],
    "js/indexworker.js": ["js/indexworker.js"],
    "css/app.css": [
      "css/index.css",
      "css/portal.css"
    ],

    "js/openpgp.min.js": ["js/openpgp.min.js"],
    "js/openpgp.worker.min.js": ["js/openpgp.worker.min.js"]
  },
  rpc: {
    host: "localhost",
    port: 8545
  }
};
