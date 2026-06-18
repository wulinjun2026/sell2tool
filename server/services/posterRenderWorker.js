const { spawn } = require('child_process');
const path = require('path');
const { ROOT } = require('../db');

const CLI_PATH = path.join(ROOT, 'server', 'scripts', 'render-poster-cli.js');
const MAX_BUFFER = 32 * 1024 * 1024;

function spawnPosterRender({ vehicleIds, templateId, previewMode = false }) {
  return new Promise((resolve, reject) => {
    const args = [
      CLI_PATH,
      '--vehicle-ids',
      vehicleIds.join(','),
      '--template-id',
      templateId,
    ];
    if (previewMode) args.push('--preview');

    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        const message = stderr.trim() || stdout.trim() || `render exit ${code}`;
        return reject(new Error(message));
      }
      if (stdout.length > MAX_BUFFER) {
        return reject(new Error('POSTER_OUTPUT_TOO_LARGE'));
      }
      try {
        const payload = JSON.parse(stdout.trim());
        if (!payload.ok) return reject(new Error(payload.error || 'RENDER_FAILED'));
        resolve(payload);
      } catch (err) {
        reject(new Error(`POSTER_JSON_INVALID: ${err.message}`));
      }
    });
  });
}

module.exports = { spawnPosterRender };
