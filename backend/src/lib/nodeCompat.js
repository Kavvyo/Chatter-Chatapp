import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bufferModule = require('buffer');

// Node.js 26 removed buffer.SlowBuffer; restore a minimal polyfill before legacy JWT dependencies load.
if (!bufferModule.SlowBuffer) {
  function SlowBufferCompat(size) {
    return bufferModule.Buffer.allocUnsafeSlow(size);
  }
  SlowBufferCompat.prototype = Object.create(bufferModule.Buffer.prototype);
  bufferModule.SlowBuffer = SlowBufferCompat;
}
