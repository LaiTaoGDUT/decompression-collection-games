'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * Keep browser verification captures outside the repository. The captures are
 * useful while a check is running, but they are disposable diagnostics rather
 * than game documentation or shipped assets.
 */
function createVerificationArtifactDir(prefix = 'bubble-shooter-verify-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dir,
    cleanup() {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

module.exports = { createVerificationArtifactDir };
