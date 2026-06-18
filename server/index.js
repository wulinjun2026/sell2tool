const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { initDb, ROOT, UPLOADS_DIR, vehicleDir } = require('./db');
const vehicleRepo = require('./services/vehicleRepository');
const sellingEngine = require('./services/sellingEngine');
const copyPolish = require('./services/copyPolish');
const descExtract = require('./services/descExtract');
const posterRender = require('./services/posterRender');
const posterGenerationRepo = require('./services/posterGenerationRepository');
const analytics = require('./services/analytics');
const dealerProfile = require('./services/dealerProfile');
const authService = require('./services/authService');
const userRepo = require('./services/userRepository');
const aiRequestQueue = require('./services/aiRequestQueue');
const appSettings = require('./services/appSettings');
const userAdminService = require('./services/userAdminService');
const { ensurePosterFonts } = require('./services/posterFonts');
const { isUsableRasterBuffer } = require('./services/imageMeta');
const app = express();
const PORT = process.env.PORT || 3000;
ensurePosterFonts();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(UPLOADS_DIR));
app.use('/assets', express.static(path.join(ROOT, 'assets')));
app.use(express.static(path.join(ROOT, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const qrcodeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!file.mimetype?.startsWith('image/')) {
      return cb(new Error('INVALID_IMAGE'));
    }
    cb(null, true);
  },
});

function asyncRoute(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function respondAiRouteError(res, err, fallbackCode, fallbackMessage) {
  const code = err?.code || err?.message;
  if (code === 'AI_QUEUE_FULL') {
    return res.status(503).json({ error: { code, message: 'AI 服务繁忙，请稍后重试' } });
  }
  if (code === 'AI_QUEUE_TIMEOUT') {
    return res.status(503).json({ error: { code, message: 'AI 排队超时，请稍后重试' } });
  }
  return res.status(500).json({
    error: { code: fallbackCode, message: fallbackMessage || err?.message || fallbackCode },
  });
}

function createSettingsGuard() {
  return (req, res, next) => {
    if (!appSettings.canManageSettings(req.user)) {
      return res.status(403).json({
        error: { code: 'SETTINGS_FORBIDDEN', message: '仅管理员可修改该配置' },
      });
    }
    next();
  };
}

function createRoutes(db) {
  const requireAuth = authService.createRequireAuth(db);
  const requireSettingsAdmin = createSettingsGuard();

  async function loadOwnedVehicle(req, res, vehicleId) {
    const vehicle = await vehicleRepo.findById(db, vehicleId, req.userId);
    if (!vehicle) {
      res.status(404).json({ error: { code: 'VEHICLE_NOT_FOUND' } });
      return null;
    }
    return vehicle;
  }

  app.get('/api/health', (req, res) => {
    const system = appSettings.getSystem();
    res.json({
      ok: true,
      version: '1.1.0',
      db: db.driver || 'sqlite',
      aiQueue: aiRequestQueue.getStats(),
      system: {
        smsCooldownSec: system.smsCooldownSec,
        trialDays: system.trialDays,
        productLimit: system.productLimit,
      },
    });
  });

  app.post('/api/auth/sms/send', asyncRoute(async (req, res) => {
    try {
      const result = await authService.sendSmsCode(db, req.body?.phone);
      res.json(result);
    } catch (err) {
      const code = err.message || 'SEND_FAILED';
      res.status(code === 'INVALID_PHONE' ? 400 : 500).json({
        error: { code, message: code === 'INVALID_PHONE' ? '请输入正确的手机号' : '验证码发送失败' },
      });
    }
  }));

  app.post('/api/auth/sms/verify', asyncRoute(async (req, res) => {
    try {
      const result = await authService.verifySmsCode(db, req.body?.phone, req.body?.code);
      const dealer = await dealerProfile.getOrCreate(db, result.user.id, result.user.phone);
      res.json({
        token: result.token,
        expiresAt: result.expiresAt,
        user: result.user,
        usage: result.usage,
        upgraded: !!result.upgraded,
        dealer,
        canManageSettings: appSettings.canManageSettings(result.user),
      });
    } catch (err) {
      const code = err.message || 'VERIFY_FAILED';
      res.status(400).json({
        error: {
          code,
          message: code === 'CODE_INVALID' ? '验证码错误或已过期' : '登录失败',
        },
      });
    }
  }));

  app.get('/api/auth/me', requireAuth, asyncRoute(async (req, res) => {
    const usage = await userRepo.getUsage(db, req.userId);
    const dealer = await dealerProfile.get(db, req.userId);
    res.json({
      user: req.user,
      usage,
      dealer,
      canManageSettings: appSettings.canManageSettings(req.user),
    });
  }));

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/vehicles', requireAuth, asyncRoute(async (req, res) => {
    const filter = {
      userId: req.userId,
      status: req.query.status,
      keyword: req.query.keyword,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset, 10) : undefined,
    };
    if (filter.status && filter.status.includes(',')) {
      filter.status = filter.status.split(',');
    }
    const list = await vehicleRepo.list(db, filter);
    await analytics.track(db, 'vehicle_list_view', { total_count: list.length, filter_status: req.query.status || 'all', user_id: req.userId });
    res.json({ vehicles: list, counts: await vehicleRepo.countByStatus(db, req.userId) });
  }));

  app.post('/api/vehicles', requireAuth, asyncRoute(async (req, res) => {
    await analytics.track(db, 'vehicle_create_start', { entry: req.body.entry || 'api', user_id: req.userId });
    try {
      const vehicle = await vehicleRepo.createDraft(db, req.userId);
      await analytics.track(db, 'vehicle_created', { vehicle_id: vehicle.id, code: vehicle.code, user_id: req.userId });
      res.status(201).json(vehicle);
    } catch (err) {
      if (err.message === 'TRIAL_EXPIRED') {
        return res.status(403).json({
          error: {
            code: 'TRIAL_EXPIRED',
            message: `免费试用已到期（${err.trialDays || userRepo.getTrialDays()} 天），请付费升级后继续`,
            trialDays: err.trialDays || userRepo.getTrialDays(),
            trialEndsAt: err.trialEndsAt,
          },
        });
      }
      if (err.message === 'PRODUCT_LIMIT_REACHED') {
        return res.status(403).json({
          error: {
            code: 'PRODUCT_LIMIT_REACHED',
            message: `免费版最多发布 ${err.limit} 个产品，请付费升级后继续`,
            limit: err.limit,
            current: err.current,
          },
        });
      }
      throw err;
    }
  }));

  app.get('/api/vehicles/:id', requireAuth, asyncRoute(async (req, res) => {
    const vehicle = await loadOwnedVehicle(req, res, req.params.id);
    if (!vehicle) return;
    res.json(vehicle);
  }));

  app.put('/api/vehicles/:id', requireAuth, asyncRoute(async (req, res) => {
    const existing = await loadOwnedVehicle(req, res, req.params.id);
    if (!existing) return;
    const vehicle = await vehicleRepo.saveVehicle(db, { ...existing, ...req.body, id: req.params.id }, req.userId);
    await analytics.track(db, 'vehicle_draft_saved', { vehicle_id: vehicle.id, user_id: req.userId });
    res.json(vehicle);
  }));

  app.patch('/api/vehicles/:id/status', requireAuth, asyncRoute(async (req, res) => {
    const { status } = req.body;
    if (!['draft', 'on_sale', 'sold'].includes(status)) {
      return res.status(400).json({ error: { code: 'INVALID_STATUS' } });
    }
    const existing = await loadOwnedVehicle(req, res, req.params.id);
    if (!existing) return;
    await vehicleRepo.updateStatus(db, req.params.id, status, req.userId);
    await analytics.track(db, status === 'sold' ? 'vehicle_marked_sold' : 'vehicle_updated', {
      vehicle_id: req.params.id,
      status,
      batch: false,
      user_id: req.userId,
    });
    res.json({ ok: true });
  }));

  app.delete('/api/vehicles/:id/poster-record', requireAuth, asyncRoute(async (req, res) => {
    const vehicle = await loadOwnedVehicle(req, res, req.params.id);
    if (!vehicle) return;
    const removed = await posterGenerationRepo.deleteAllForVehicle(db, req.params.id);
    await db.run(
      `UPDATE vehicles SET template_id = NULL, long_image_path = NULL, long_image_updated_at = NULL, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      Date.now(),
      req.params.id,
      req.userId
    );
    res.json({ ok: true, removed });
  }));

  app.delete('/api/poster-generations/:id', requireAuth, asyncRoute(async (req, res) => {
    const row = await db.get('SELECT id FROM poster_generations WHERE id = ?', req.params.id);
    if (!row) return res.status(404).json({ error: { code: 'GENERATION_NOT_FOUND' } });
    await posterGenerationRepo.deleteById(db, req.params.id);
    res.json({ ok: true });
  }));

  app.delete('/api/vehicles/:id', requireAuth, asyncRoute(async (req, res) => {
    const v = await loadOwnedVehicle(req, res, req.params.id);
    if (!v) return;
    await vehicleRepo.deleteVehicle(db, req.params.id, req.userId);
    await analytics.track(db, 'vehicle_deleted', { vehicle_id: req.params.id, status: v.status, user_id: req.userId });
    res.json({ ok: true });
  }));

  app.post('/api/vehicles/batch-delete', requireAuth, asyncRoute(async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: { code: 'INVALID_ARGUMENT' } });
    await vehicleRepo.deleteBatch(db, ids, req.userId);
    await analytics.track(db, 'vehicle_deleted', { batch: true, count: ids.length, user_id: req.userId });
    res.json({ ok: true });
  }));

  app.post('/api/vehicles/batch-sold', requireAuth, asyncRoute(async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: { code: 'INVALID_ARGUMENT' } });
    for (const id of ids) {
      await vehicleRepo.updateStatus(db, id, 'sold', req.userId);
    }
    await analytics.track(db, 'vehicle_marked_sold', { batch: true, count: ids.length, user_id: req.userId });
    res.json({ ok: true });
  }));

  app.get('/api/vehicles/:vehicleId/photos/progress', requireAuth, asyncRoute(async (req, res) => {
    const vehicle = await loadOwnedVehicle(req, res, req.params.vehicleId);
    if (!vehicle) return;
    const progress = await vehicleRepo.getUploadProgress(db, req.params.vehicleId);
    res.json(progress);
  }));

  app.post('/api/vehicles/:vehicleId/photos', requireAuth, upload.single('photo'), asyncRoute(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: { code: 'NO_FILE' } });
    const maxBytes = appSettings.getSystem().photoMaxMb * 1024 * 1024;
    if (req.file.size > maxBytes) {
      return res.status(400).json({
        error: { code: 'FILE_TOO_LARGE', message: `单张照片不能超过 ${appSettings.getSystem().photoMaxMb}MB` },
      });
    }
    const { category, slotKey } = req.body;
    if (!category || !slotKey) {
      return res.status(400).json({ error: { code: 'INVALID_SLOT' } });
    }
    const vehicleId = req.params.vehicleId;
    const vehicle = await loadOwnedVehicle(req, res, vehicleId);
    if (!vehicle) return;

    const photosBefore = await vehicleRepo.loadPhotos(db, vehicleId);
    const sortIndex = photosBefore.filter((p) => p.category === category && p.slotKey === slotKey).length;

    const replace = req.body.replace === 'true' || req.body.replace === true;
    if (replace) {
      const existing = photosBefore.filter((p) => p.category === category && p.slotKey === slotKey);
      for (const p of existing) {
        if (fs.existsSync(p.filePath)) fs.unlinkSync(p.filePath);
        await db.run('DELETE FROM vehicle_photos WHERE id = ?', p.id);
      }
    }

    const slotCount = replace ? 0 : sortIndex;

    const ext = path.extname(req.file.originalname || '').toLowerCase() || '.jpg';
    const dir = path.join(vehicleDir(vehicleId), 'photos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${uuidv4()}${ext}`);
    fs.writeFileSync(filePath, req.file.buffer);

    const photoId = uuidv4();
    await db.run(
      `INSERT INTO vehicle_photos (id, vehicle_id, category, slot_key, file_path, sort_index, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      photoId,
      vehicleId,
      category,
      slotKey,
      filePath,
      slotCount,
      req.file.size,
      Date.now()
    );

    if (category === 'exterior' && slotKey === 'front' && slotCount === 0) {
      await db.run('UPDATE vehicles SET thumb_path = ?, updated_at = ? WHERE id = ?', filePath, Date.now(), vehicleId);
    }

    await analytics.track(db, 'photo_added', {
      vehicle_id: vehicleId,
      category,
      slot_key: slotKey,
      source: req.body.source || 'gallery',
      count_in_slot: slotCount + 1,
      replaced: replace,
    });

    const photos = await vehicleRepo.loadPhotos(db, vehicleId);
    res.status(201).json({
      photo: photos[photos.length - 1],
      progress: await vehicleRepo.getUploadProgress(db, vehicleId),
    });
  }));

  app.delete('/api/vehicles/:vehicleId/photos/:photoId', requireAuth, asyncRoute(async (req, res) => {
    const vehicle = await loadOwnedVehicle(req, res, req.params.vehicleId);
    if (!vehicle) return;
    const photo = await db.get(
      'SELECT * FROM vehicle_photos WHERE id = ? AND vehicle_id = ?',
      req.params.photoId,
      req.params.vehicleId
    );
    if (!photo) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
    if (fs.existsSync(photo.file_path)) fs.unlinkSync(photo.file_path);
    await db.run('DELETE FROM vehicle_photos WHERE id = ?', req.params.photoId);

    const vehicleRow = await db.get('SELECT thumb_path FROM vehicles WHERE id = ?', req.params.vehicleId);
    if (vehicleRow?.thumb_path === photo.file_path) {
      const nextFront = await db.get(
        `SELECT file_path FROM vehicle_photos
         WHERE vehicle_id = ? AND category = 'exterior' AND slot_key = 'front'
         ORDER BY sort_index ASC LIMIT 1`,
        req.params.vehicleId
      );
      await db.run(
        'UPDATE vehicles SET thumb_path = ?, updated_at = ? WHERE id = ?',
        nextFront?.file_path || null,
        Date.now(),
        req.params.vehicleId
      );
    } else {
      await db.run('UPDATE vehicles SET updated_at = ? WHERE id = ?', Date.now(), req.params.vehicleId);
    }

    await analytics.track(db, 'photo_removed', { vehicle_id: req.params.vehicleId, slot_key: photo.slot_key });
    res.json({ ok: true });
  }));

  app.post('/api/selling-points/generate', requireAuth, asyncRoute(async (req, res) => {
    const { rawText, brandModel, priceWan, limit } = req.body || {};
    if (!rawText?.trim() && !brandModel?.trim()) {
      return res.status(400).json({ error: { code: 'EMPTY_INPUT', message: '请先填写产品描述或产品名称' } });
    }

    await analytics.track(db, 'selling_points_generate_requested', {
      raw_length: (rawText || '').length,
      has_brand: Boolean(brandModel),
    });

    const start = Date.now();
    try {
      const result = await copyPolish.generateSellingPointsFromInput(rawText || '', {
        brandModel: brandModel || '',
        priceWan: priceWan != null ? Number(priceWan) : null,
        limit: parseInt(limit || '12', 10),
      });

      await analytics.track(db, 'selling_points_generate_success', {
        source: result.source,
        count: result.points.length,
        duration_ms: Date.now() - start,
      });

      res.json({
        points: result.points,
        source: result.source,
        durationMs: result.durationMs,
      });
    } catch (err) {
      await analytics.track(db, 'selling_points_generate_failed', { error_code: err.message });
      if (err.code === 'AI_QUEUE_FULL' || err.code === 'AI_QUEUE_TIMEOUT') {
        return respondAiRouteError(res, err, 'GENERATE_FAILED', '提炼总结失败');
      }
      res.status(500).json({ error: { code: err.message || 'GENERATE_FAILED', message: '提炼总结失败' } });
    }
  }));

  app.post('/api/desc/extract', requireAuth, asyncRoute(async (req, res) => {
    const { rawText } = req.body || {};
    if (!rawText?.trim()) {
      return res.status(400).json({ error: { code: 'EMPTY_INPUT', message: '请先填写产品描述' } });
    }

    await analytics.track(db, 'desc_extract_requested', { raw_length: rawText.length });
    const start = Date.now();
    try {
      const result = await descExtract.extractVehicleInfoFromDescription(rawText);
      await analytics.track(db, 'desc_extract_success', {
        source: result.source,
        has_brand: Boolean(result.brandModel),
        has_price: result.priceWan != null,
        duration_ms: Date.now() - start,
      });
      res.json({
        brandModel: result.brandModel || '',
        priceWan: result.priceWan,
        priceLabel: result.priceWan != null ? String(result.priceWan) : '未公布',
        source: result.source,
        durationMs: result.durationMs,
      });
    } catch (err) {
      await analytics.track(db, 'desc_extract_failed', { error_code: err.message });
      if (err.code === 'AI_QUEUE_FULL' || err.code === 'AI_QUEUE_TIMEOUT') {
        return respondAiRouteError(res, err, 'EXTRACT_FAILED', '识别失败');
      }
      res.status(500).json({ error: { code: err.message || 'EXTRACT_FAILED', message: '识别失败' } });
    }
  }));

  app.get('/api/selling-points/recommend', requireAuth, asyncRoute(async (req, res) => {
    const limit = parseInt(req.query.limit || '12', 10);
    const year = req.query.year ? parseInt(req.query.year, 10) : null;
    const { points, profile } = await sellingEngine.recommendForVehicle(db, {
      brandModel: req.query.brandModel || '',
      year,
      limit,
    });
    res.json({ points, profile });
  }));

  app.get('/api/selling-points', requireAuth, asyncRoute(async (req, res) => {
    if (req.query.category) {
      return res.json({ points: await sellingEngine.listByCategory(db, req.query.category) });
    }
    if (req.query.keyword) {
      return res.json({ points: await sellingEngine.search(db, req.query.keyword) });
    }
    res.json({ points: await sellingEngine.recommend(db, '', 20) });
  }));

  app.post('/api/polish', requireAuth, asyncRoute(async (req, res) => {
    const { scene, rawText, sellingPoints, maxLength, brandModel } = req.body;
    if (!rawText && scene !== 'selling_points_combo') {
      return res.status(400).json({ error: { code: 'INVALID_ARGUMENT' } });
    }

    await analytics.track(db, 'ai_polish_requested', {
      scene: scene || 'vehicle_description',
      raw_length: (rawText || '').length,
    });

    const start = Date.now();
    try {
      let result;
      if (scene === 'selling_points_combo' && sellingPoints?.length) {
        result = await copyPolish.polishSync({
          scene: 'selling_points_combo',
          rawText: sellingPoints.map((p) => p.text).join('\n'),
          sellingPointIds: sellingPoints,
          maxLength: maxLength || 120,
        });
      } else {
        result = await copyPolish.polishSync({
          scene: 'vehicle_description',
          rawText,
          brandModel: brandModel || '',
          maxLength: maxLength || 100,
        });
      }

      await analytics.track(db, 'ai_polish_success', {
        source: result.source,
        duration_ms: Date.now() - start,
        output_length: result.polished.length,
      });
      res.json(result);
    } catch (err) {
      await analytics.track(db, 'ai_polish_failed', { error_code: err.message });
      if (err.code === 'AI_QUEUE_FULL' || err.code === 'AI_QUEUE_TIMEOUT') {
        return respondAiRouteError(res, err, 'POLISH_FAILED', '润色失败');
      }
      res.status(500).json({ error: { code: 'POLISH_FAILED', message: err.message } });
    }
  }));

  app.get('/api/templates', asyncRoute(async (req, res) => {
    const templates = await db.all('SELECT * FROM poster_templates WHERE enabled = 1 ORDER BY sort_order');
    res.json({
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        style: t.style,
        layoutPath: t.layout_path,
      })),
    });
  }));

  app.post('/api/posters/compose', requireAuth, asyncRoute(async (req, res) => {
    const { vehicleIds, templateId, photoLayout, previewMode } = req.body;
    if (!vehicleIds?.length || !templateId) {
      return res.status(400).json({ error: { code: 'INVALID_ARGUMENT' } });
    }

    const start = Date.now();
    const isPreview = !!previewMode;
    if (!isPreview) {
      await analytics.track(db, 'poster_generate_start', {
        vehicle_ids: vehicleIds,
        vehicle_count: vehicleIds.length,
        template_id: templateId,
        photo_layout: photoLayout || 'grid_2',
        client_render: true,
      });
    }

    try {
      const vehicles = (await Promise.all(vehicleIds.map((id) => vehicleRepo.findById(db, id, req.userId)))).filter(Boolean);
      if (vehicles.length !== vehicleIds.length) {
        return res.status(404).json({ error: { code: 'VEHICLE_NOT_FOUND' } });
      }

      const dealer = await dealerProfile.get(db, req.userId);
      const composed = await posterRender.buildPosterCompose({
        vehicles,
        templateId,
        photoLayout: photoLayout || 'grid_2',
        dealer,
        previewMode: isPreview,
      });

      res.json({
        ...composed,
        generationId: null,
        clientRender: true,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      await analytics.track(db, 'poster_generate_failed', {
        vehicle_ids: vehicleIds,
        error_code: err.message,
        duration_ms: Date.now() - start,
      });
      res.status(500).json({ error: { code: err.message || 'COMPOSE_FAILED' } });
    }
  }));

  /** @deprecated 服务端不再生成 PNG，请使用 /api/posters/compose + 客户端渲染 */
  app.post('/api/posters/render', asyncRoute(async (req, res) => {
    res.status(410).json({
      error: {
        code: 'SERVER_RENDER_DISABLED',
        message: '请使用客户端渲染长图（/api/posters/compose）',
      },
    });
  }));

  app.post('/api/posters/confirm', requireAuth, asyncRoute(async (req, res) => {
    const { vehicleIds, templateId, width, height, fileSize } = req.body;
    if (!vehicleIds?.length || !templateId) {
      return res.status(400).json({ error: { code: 'INVALID_ARGUMENT' } });
    }
    const vehicles = (await Promise.all(vehicleIds.map((id) => vehicleRepo.findById(db, id, req.userId)))).filter(Boolean);
    if (vehicles.length !== vehicleIds.length) {
      return res.status(404).json({ error: { code: 'VEHICLE_NOT_FOUND' } });
    }
    const record = await posterGenerationRepo.create(db, {
      vehicleIds,
      templateId,
      width,
      height,
      fileSize,
      durationMs: 0,
      isPreview: false,
    });
    await vehicleRepo.markPosterGenerated(db, vehicleIds, templateId, req.userId);
    res.json({ generationId: record.id });
  }));

  app.post('/api/share/default-copy', requireAuth, asyncRoute(async (req, res) => {
    const { vehicleIds } = req.body;
    const vehicles = (await Promise.all((vehicleIds || []).map((id) => vehicleRepo.findById(db, id, req.userId)))).filter(Boolean);
    if (!vehicles.length) return res.json({ copyText: '今日好物推荐，欢迎咨询👀' });

    if (vehicles.length === 1) {
      const v = vehicles[0];
      const copyText = `刚上架一件${v.brandModel || '精品产品'}，${v.mileageKm ? `仅${Math.round(v.mileageKm / 10000)}万公里，` : ''}懂的来👀`;
      return res.json({ copyText });
    }
    res.json({ copyText: `今日好物推荐，${vehicles.length}件精品产品可供选择💰` });
  }));

  app.post('/api/share', requireAuth, asyncRoute(async (req, res) => {
    const { vehicleIds, copyText, shareType, generationId, isReuse } = req.body;
    const now = Date.now();

    for (const vehicleId of vehicleIds || []) {
      const owned = await vehicleRepo.findById(db, vehicleId, req.userId);
      if (!owned) {
        return res.status(404).json({ error: { code: 'VEHICLE_NOT_FOUND' } });
      }
      await db.run(
        `INSERT INTO share_records (id, vehicle_id, shared_at, copy_text, share_type, long_image_path)
         VALUES (?, ?, ?, ?, ?, ?)`,
        uuidv4(),
        vehicleId,
        now,
        copyText,
        shareType || 'long_image_only',
        generationId || null
      );
      await vehicleRepo.updateStatus(db, vehicleId, 'on_sale', req.userId);
    }

    await analytics.track(db, 'share_success', {
      vehicle_ids: vehicleIds,
      share_type: shareType,
      is_reuse: !!isReuse,
    });

    if (isReuse) {
      await analytics.track(db, 'poster_reused', { vehicle_id: vehicleIds?.[0] });
    }

    res.json({ ok: true, message: '分享成功（演示模式：已记录分享历史）' });
  }));

  app.get('/api/dealer', requireAuth, asyncRoute(async (req, res) => {
    res.json((await dealerProfile.get(db, req.userId)) || {});
  }));

  app.put('/api/dealer', requireAuth, asyncRoute(async (req, res) => {
    const { shopName, contactPhone, contactWechat, watermarkText, watermarkEnabled } = req.body;
    const updated = await dealerProfile.update(db, req.userId, {
      shopName,
      contactPhone,
      contactWechat,
      watermarkText,
      watermarkEnabled,
    });
    if (!updated) return res.status(404).json({ error: { code: 'DEALER_NOT_FOUND' } });
    await analytics.track(db, 'dealer_profile_updated', {
      has_watermark: !!updated.watermarkText,
      has_qrcode: !!updated.qrcodePath,
    });
    res.json(updated);
  }));

  app.post('/api/dealer/qrcode', requireAuth, qrcodeUpload.single('qrcode'), asyncRoute(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: { code: 'NO_FILE' } });
    const qrMax = appSettings.getSystem().qrcodeMaxMb * 1024 * 1024;
    if (req.file.size > qrMax) {
      return res.status(400).json({
        error: { code: 'FILE_TOO_LARGE', message: `二维码不能超过 ${appSettings.getSystem().qrcodeMaxMb}MB` },
      });
    }
    if (!isUsableRasterBuffer(req.file.buffer, 200)) {
      return res.status(400).json({ error: { code: 'QRCODE_TOO_SMALL', message: '二维码图片过小，请上传至少 200×200 像素的清晰原图' } });
    }
    const ext = path.extname(req.file.originalname || '').toLowerCase() || '.png';
    const filePath = path.join(dealerProfile.dealerDir(req.userId), `qrcode_${uuidv4()}${ext}`);
    fs.writeFileSync(filePath, req.file.buffer);
    const updated = await dealerProfile.setQrcodePath(db, req.userId, filePath);
    if (!updated) return res.status(404).json({ error: { code: 'DEALER_NOT_FOUND' } });
    await analytics.track(db, 'dealer_profile_updated', { has_watermark: !!updated.watermarkText, has_qrcode: true });
    res.status(201).json(updated);
  }));

  app.get('/api/analytics/events', asyncRoute(async (req, res) => {
    const limit = parseInt(req.query.limit || '50', 10);
    const events = await db.all('SELECT * FROM analytics_events ORDER BY created_at DESC LIMIT ?', limit);
    res.json({ events: events.map((e) => ({ ...e, properties: JSON.parse(e.properties || '{}') })) });
  }));

  app.get('/api/stats', requireAuth, asyncRoute(async (req, res) => {
    const shareRow = await db.get(
      `SELECT COUNT(*) AS c FROM share_records sr
       INNER JOIN vehicles v ON v.id = sr.vehicle_id
       WHERE v.user_id = ?`,
      req.userId
    );
    const posterTotal = await vehicleRepo.countPublishedVehicles(db, req.userId);
    const usage = await userRepo.getUsage(db, req.userId);
    res.json({
      counts: await vehicleRepo.countByStatus(db, req.userId),
      shareTotal: Number(shareRow?.c ?? 0),
      posterTotal,
      usage,
    });
  }));

  app.get('/api/settings/client', requireAuth, (req, res) => {
    const all = appSettings.getSettings();
    const system = appSettings.getSystem();
    res.json({
      settings: appSettings.getClient(),
      system: {
        smsCooldownSec: system.smsCooldownSec,
        trialDays: system.trialDays,
        productLimit: system.productLimit,
      },
      updatedAt: all.updatedAt,
    });
  });

  app.get('/api/settings/:category', requireAuth, requireSettingsAdmin, (req, res) => {
    const category = req.params.category;
    if (!['system', 'ai', 'client'].includes(category)) {
      return res.status(400).json({ error: { code: 'INVALID_SETTINGS_CATEGORY' } });
    }
    const all = appSettings.getSettings();
    res.json({ settings: appSettings.getCategoryForAdmin(category), updatedAt: all.updatedAt });
  });

  app.put('/api/settings/:category', requireAuth, requireSettingsAdmin, asyncRoute(async (req, res) => {
    const category = req.params.category;
    if (!['system', 'ai', 'client'].includes(category)) {
      return res.status(400).json({ error: { code: 'INVALID_SETTINGS_CATEGORY' } });
    }
    const payload = req.body?.settings && typeof req.body.settings === 'object'
      ? req.body.settings
      : req.body;
    const updated = appSettings.updateCategory(category, payload || {});
    if (category === 'ai') aiRequestQueue.reloadFromSettings();
    if (category === 'system' && updated.publicBaseUrl) {
      process.env.PUBLIC_BASE_URL = updated.publicBaseUrl;
    }
    const all = appSettings.getSettings();
    res.json({ settings: appSettings.getCategoryForAdmin(category), updatedAt: all.updatedAt });
  }));

  app.get('/api/admin/users/overview', requireAuth, requireSettingsAdmin, asyncRoute(async (req, res) => {
    const overview = await userAdminService.getOverview(db);
    res.json({ overview });
  }));

  app.get('/api/admin/users', requireAuth, requireSettingsAdmin, asyncRoute(async (req, res) => {
    const q = String(req.query.q || '');
    const status = String(req.query.status || 'all');
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '100', 10)));
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
    const data = await userAdminService.listUsers(db, { q, status, limit, offset });
    res.json(data);
  }));

  app.patch('/api/admin/users/:id/plan', requireAuth, requireSettingsAdmin, asyncRoute(async (req, res) => {
    const plan = req.body?.plan;
    const user = await userRepo.findById(db, req.params.id);
    if (!user) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: '用户不存在' } });
    }
    try {
      const updated = await userAdminService.setUserPlan(db, user.id, plan);
      res.json({ user: updated });
    } catch (err) {
      if (err.message === 'INVALID_PLAN') {
        return res.status(400).json({ error: { code: 'INVALID_PLAN', message: '无效账号类型' } });
      }
      throw err;
    }
  }));

  app.get('*', (req, res) => {
    res.sendFile(path.join(ROOT, 'public', 'index.html'));
  });

  app.use((err, req, res, next) => {
    console.error(err);
    if (err.message === 'FORBIDDEN') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: '无权访问该产品' } });
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  });
}

async function bootstrap() {
  appSettings.loadSettings();
  aiRequestQueue.reloadFromSettings();
  const db = await initDb();
  createRoutes(db);

  app.listen(PORT, () => {
    console.log(`\n📦 通用产品销售助手 MVP 已启动`);
    console.log(`   数据库: ${db.driver || 'sqlite'}`);
    console.log(`   本地访问: http://localhost:${PORT}`);
    console.log(`   API 文档: http://localhost:${PORT}/api/health\n`);
    analytics.track(db, 'app_launch', { is_first_launch: true }).catch(console.error);
  });
}

bootstrap().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});

module.exports = app;
