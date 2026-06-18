#!/usr/bin/env node
/**
 * 在独立子进程中生成长图，避免阻塞主服务事件循环。
 * 输出单行 JSON（含 pngBase64），不写持久化 PNG 文件。
 */
const path = require('path');

const ROOT = path.join(__dirname, '../..');
process.chdir(ROOT);

const { initDb } = require('../db');
const vehicleRepo = require('../services/vehicleRepository');
const dealerProfile = require('../services/dealerProfile');
const { renderPosterToBuffer } = require('../services/posterRender');

function parseArgs(argv) {
  const opts = { vehicleIds: [], templateId: '', preview: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--vehicle-ids') opts.vehicleIds = argv[++i].split(',').filter(Boolean);
    else if (arg === '--template-id') opts.templateId = argv[++i];
    else if (arg === '--preview') opts.preview = true;
  }
  if (!opts.vehicleIds.length || !opts.templateId) {
    throw new Error('INVALID_ARGUMENT');
  }
  return opts;
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const db = await initDb();
  try {
    let vehicles = (await Promise.all(opts.vehicleIds.map((id) => vehicleRepo.findById(db, id)))).filter(Boolean);
    if (vehicles.length !== opts.vehicleIds.length) {
      emit({ ok: false, error: 'VEHICLE_NOT_FOUND' });
      process.exit(2);
      return;
    }

    if (!opts.preview) {
      for (const v of vehicles) {
        if (!v.code && (await vehicleRepo.hasVehicleInfo(v, db))) {
          await vehicleRepo.ensureVehicleCode(db, v.id);
        }
      }
      vehicles = (await Promise.all(opts.vehicleIds.map((id) => vehicleRepo.findById(db, id)))).filter(Boolean);
    }

    const dealer = await dealerProfile.get(db);
    const result = await renderPosterToBuffer({
      vehicles,
      templateId: opts.templateId,
      dealer,
      previewMode: opts.preview,
    });

    emit({
      ok: true,
      pngBase64: result.pngBuffer.toString('base64'),
      width: result.width,
      height: result.height,
      durationMs: result.durationMs,
      blockCount: result.blockCount,
      fileSize: result.fileSize,
      mimeType: 'image/png',
      format: 'png',
      previewMode: !!opts.preview,
    });
  } catch (err) {
    emit({ ok: false, error: err.message || 'RENDER_FAILED' });
    process.exit(1);
  } finally {
    if (typeof db.close === 'function') await db.close();
  }
}

main();
