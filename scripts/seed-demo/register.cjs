/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS preload */
// Preload for `npm run seed:demo`: the app's server modules `import "server-only"`, which throws
// outside Next's react-server build. This script is server code, so resolve it to an empty module.
// (The react-server condition isn't an option: it breaks the React imports behind next/navigation.)
const Module = require("node:module");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === "server-only" ? require.resolve("./empty.cjs") : originalResolve.call(this, request, ...rest);
};
