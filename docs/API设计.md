# 通用产品销售助手 — API 设计

**版本**: v1.1  
**日期**: 2026-06-15  
**关联文档**: [系统架构设计.md](../系统架构设计.md)、[数据库DDL.md](./数据库DDL.md)、[开发更新日志.md](./开发更新日志.md)

---

## 1. 概述

本产品的 API 分为三类：

| 类型 | 说明 | MVP 是否必需 |
|------|------|--------------|
| **端内 SDK** | Repository、渲染引擎、分享桥接等 TypeScript/Dart 接口 | 是 |
| **外部 LLM API** | 文案润色（仅文本） | 是（可降级） |
| **BFF REST** | 统一代理、模板下发、团队配置 | 二期 |

**隐私原则**：默认不向服务端上传相册原图；LLM 请求体仅含文本字段。

---

## 2. 端内 SDK 接口（Domain / Infrastructure）

### 2.1 VehicleRepository

车辆持久化与查询，实现见 [数据库DDL.md](./数据库DDL.md)。

```typescript
type VehicleStatus = 'draft' | 'on_sale' | 'sold';

interface VehicleFilter {
  status?: VehicleStatus | VehicleStatus[];
  keyword?: string;           // 匹配 code / brand_model
  yearMin?: number;
  yearMax?: number;
  priceMinWan?: number;
  priceMaxWan?: number;
  sortBy?: 'updated_at' | 'created_at' | 'price_wan';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

interface VehicleRepository {
  /** 创建或全量更新（含 photos JSON） */
  save(vehicle: Vehicle): Promise<void>;

  findById(id: string): Promise<Vehicle | null>;
  findByCode(code: string): Promise<Vehicle | null>;
  list(filter?: VehicleFilter): Promise<Vehicle[]>;
  countByStatus(): Promise<{ draft: number; on_sale: number; sold: number }>;

  updateStatus(id: string, status: VehicleStatus): Promise<void>;
  updateLongImage(id: string, path: string, templateId: string): Promise<void>;

  /** 删除 DB 记录并清理 vehicles/{id}/ 目录 */
  delete(id: string): Promise<void>;
  deleteBatch(ids: string[]): Promise<void>;
}
```

**错误码（端内）**：

| Code | 含义 |
|------|------|
| `VEHICLE_NOT_FOUND` | id 不存在 |
| `CODE_DUPLICATE` | 编号冲突（不应出现） |
| `STORAGE_FULL` | 超过 500MB 配额 |
| `INVALID_STATUS_TRANSITION` | 如 sold → draft |

---

### 2.2 VehicleIdService

```typescript
interface VehicleIdService {
  /**
   * 在事务内生成 CCyyyyMMddHHmmNNN
   * @throws CODE_EXHAUSTED 当日序号 > 999
   */
  generate(): Promise<string>;

  /** 校验格式，不查库 */
  validate(code: string): boolean;
}
```

---

### 2.3 MediaUploadService

```typescript
type CropRatio = '1:1' | '4:3' | '16:9';
type PhotoCategory = 'exterior' | 'interior' | 'seats';

/** 子项 key，与 RPD 4.1 对齐 */
type PhotoSlotKey =
  | 'front' | 'rear' | 'left45' | 'left' | 'right45' | 'right'
  | 'center_console' | 'screen' | 'driver_seat'
  | 'front_seats' | 'rear_seats' | 'trunk' | 'frunk';

interface UploadOptions {
  vehicleId: string;
  category: PhotoCategory;
  slotKey: PhotoSlotKey;
  source: 'camera' | 'gallery';
  cropRatio?: CropRatio;
  filterId?: string;
  applyWatermark?: boolean;
}

interface MediaUploadService {
  pickAndUpload(opts: UploadOptions): Promise<string>;  // 返回 filePath
  removePhoto(vehicleId: string, filePath: string): Promise<void>;
  listSlots(vehicleId: string): Promise<PhotoSet>;
  getUploadProgress(vehicleId: string): Promise<UploadProgress>;
}

interface UploadProgress {
  exterior: { done: number; total: 6 };
  interior: { done: number; total: 3 };
  seats: { done: number; total: number };  // 3 或 4（含 frunk）
}
```

---

### 2.4 SellingEngine

```typescript
type SellingCategory =
  | 'appearance' | 'performance' | 'interior'
  | 'value' | 'resale' | 'inspection' | 'custom';

interface SellingPointItem {
  id: string;
  category: SellingCategory;
  text: string;
  emoji?: string;
  source: 'builtin' | 'custom' | 'ai';
}

interface SellingEngine {
  /** 根据车型返回 Top N，默认 5 */
  recommend(brandModel: string, limit?: number): Promise<SellingPointItem[]>;

  listByCategory(category: SellingCategory): Promise<SellingPointItem[]>;
  search(keyword: string): Promise<SellingPointItem[]>;
}
```

---

### 2.5 CopyPolishService

```typescript
type PolishScene = 'vehicle_description' | 'selling_points_combo';
type PolishStyle = 'sales_default' | 'concise' | 'premium';

interface PolishRequest {
  scene: PolishScene;
  rawText: string;
  sellingPointIds?: string[];  // scene=selling_points_combo 时
  style?: PolishStyle;
  maxLength?: number;          // 默认 100（描述场景）
}

interface PolishResult {
  original: string;
  polished: string;
  source: 'llm' | 'local_template';
  requestId?: string;
}

interface CopyPolishService {
  polish(req: PolishRequest): AsyncIterable<string>;  // 流式 token
  polishSync(req: PolishRequest): Promise<PolishResult>;  // 完整结果
}
```

---

### 2.6 PosterRenderService

```typescript
interface RenderRequest {
  vehicleIds: string[];        // 1 = 单车，2~N = 超长图
  templateId: string;
  dealerProfileId?: string;    // 默认当前用户
  previewMode?: boolean;       // true 时降采样
  outputMaxBytes?: number;     // 默认 8 * 1024 * 1024
}

interface RenderResult {
  generationId?: string | null;  // 预览模式为 null
  imageBase64: string;           // PNG Base64，非文件路径
  width: number;
  height: number;
  durationMs: number;
  blockCount: number;
  fileSize: number;
  mimeType: 'image/png';
  previewMode: boolean;
}

interface PosterRenderService {
  render(req: RenderRequest): Promise<RenderResult>;
  measureHeight(req: RenderRequest): Promise<number>;
  /** 虚拟预览：返回可视区域块 bitmap 路径 */
  renderVisibleBlocks(
    req: RenderRequest,
    scrollOffsetY: number,
    viewportHeight: number
  ): Promise<string[]>;
}
```

---

### 2.7 ShareBridge

```typescript
type ShareType = 'long_image_only' | 'long_image_with_photos' | 'photos_only';

interface SharePayload {
  vehicleIds: string[];
  longImagePath: string;
  extraPhotoPaths?: string[];  // 最多 4 张
  copyText: string;
  shareType: ShareType;
}

interface ShareBridge {
  /** 系统预填文案 */
  buildDefaultCopy(vehicleIds: string[]): Promise<string>;

  shareToWechatMoments(payload: SharePayload): Promise<void>;

  saveToAlbum(filePath: string): Promise<void>;
}

interface ShareCallback {
  onSuccess(record: ShareRecordInput): void;
  onCancel(): void;
  onError(code: ShareErrorCode, message: string): void;
}

type ShareErrorCode =
  | 'WECHAT_NOT_INSTALLED'
  | 'USER_CANCELLED'
  | 'PERMISSION_DENIED';
```

---

### 2.8 CacheManager（perf-cache）

```typescript
interface CacheManager {
  getUsageBytes(): Promise<number>;
  getQuotaBytes(): Promise<number>;  // 默认 524288000 (500MB)
  evictLRU(targetFreeBytes: number): Promise<number>;
  clearVehicleAssets(vehicleId: string, keepPoster: boolean): Promise<void>;
}
```

---

### 2.9 AnalyticsPort

见 [埋点字典.md](./埋点字典.md)。

```typescript
interface AnalyticsPort {
  track(event: string, properties?: Record<string, unknown>): void;
  trackTiming(name: string, durationMs: number, props?: Record<string, unknown>): void;
}
```

---

## 3. LLM API（外部 / 经 BFF 代理）

### 3.1 直连模式（MVP）

兼容 **OpenAI Chat Completions** 格式的供应商（DeepSeek、OpenAI 等）。

**Endpoint**（示例 DeepSeek）：

```
POST https://api.deepseek.com/chat/completions
Authorization: Bearer {API_KEY}
Content-Type: application/json
```

**请求体**：

```json
{
  "model": "deepseek-chat",
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 256,
  "messages": [
    {
      "role": "system",
      "content": "你是二手车销售文案编辑。将用户输入润色为专业销售话术，修正语病，增强说服力，适当插入 Emoji，总字数不超过 100 字。不要编造车况、检测、回购等未在原文出现的承诺。"
    },
    {
      "role": "user",
      "content": "{{rawText}}"
    }
  ]
}
```

**卖点组合润色 — user content 模板**：

```
请将以下卖点合并为一段连贯的推荐语（不超过 120 字，适当使用 Emoji）：
1. {{point1}}
2. {{point2}}
...
```

**流式响应**：按 SSE `data: {...}` 解析 `choices[0].delta.content`。

**错误处理**：

| HTTP | 客户端行为 |
|------|------------|
| 401/403 | 提示配置 Key，降级本地模板 |
| 429 | 退避重试 1 次后降级 |
| 5xx / 超时 | 直接降级 |
| 网络不可用 | 不发起请求，本地模板 |

---

### 3.2 BFF 模式（二期）

**Base URL**：`https://api.example.com/v1`

#### POST `/polish/description`

**Request**：

```json
{
  "raw_text": "全程4S店保养，加装电尾门",
  "style": "sales_default",
  "max_length": 100
}
```

**Response 200**：

```json
{
  "request_id": "req_abc123",
  "original": "全程4S店保养，加装电尾门",
  "polished": "✨ 全程4S店保养记录齐全，已加装电尾门，用车省心！",
  "source": "llm"
}
```

#### POST `/polish/selling-points`

```json
{
  "points": ["全车原版原漆", "仅行驶3万公里", "真皮座椅零磨损"],
  "style": "sales_default"
}
```

#### GET `/templates`

返回远程模板元数据（不含用户数据）。

```json
{
  "templates": [
    {
      "id": "tpl_business_01",
      "name": "商务简约",
      "version": 3,
      "download_url": "https://cdn.example.com/templates/tpl_business_01.json",
      "sha256": "..."
    }
  ]
}
```

**通用错误体**：

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "请求过于频繁，请稍后再试"
  }
}
```

| code | HTTP |
|------|------|
| `INVALID_ARGUMENT` | 400 |
| `UNAUTHORIZED` | 401 |
| `RATE_LIMITED` | 429 |
| `UPSTREAM_LLM_ERROR` | 502 |

---

## 4. 车型识别 API（已移除 / 未来可选）

> **v1.2**：MVP 已删除 `POST /api/vehicles/:id/recognize` 及百度识图集成。车型由描述页 `brandModel` 手填。  
> 未来若恢复识别，建议独立为可选增强模块，并单独评估隐私与成本。

---

## 5. Express REST API（MVP 已实现）

**Base URL**：`http://localhost:3000`（生产示例：`http://106.12.86.64`）  
**静态资源**：`/public`、`/uploads`、`/assets`  
**鉴权**：除 `/api/health`、`/api/templates` 及部分静态资源外，业务接口需 Header：

```
Authorization: Bearer <token>
```

### 5.0 认证与用户（v1.1）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/sms/send` | 发送登录验证码；body: `{ "phone": "13800138000" }` |
| POST | `/api/auth/sms/verify` | 验证码登录；成功返回 `token`、`user`、`usage`、`dealer` |
| GET | `/api/auth/me` | 当前用户、试用配额、经销商资料 |
| POST | `/api/auth/logout` | 退出（客户端清除 token 即可） |

**试用与配额（`usage`）**：

| 字段 | 说明 |
|------|------|
| `trial.days` | 试用总天数（默认 20） |
| `trial.remainingDays` | 剩余天数 |
| `trial.expired` | 是否已过期 |
| `productLimit` | 产品上限（免费 40） |
| `productCount` | 当前产品数 |
| `canCreate` | 是否可新建产品 |
| `unlimited` | 付费用户为 true |

**错误码**：

| code | HTTP | 说明 |
|------|------|------|
| `INVALID_PHONE` | 400 | 手机号格式错误 |
| `CODE_INVALID` | 401 | 验证码错误或过期 |
| `TRIAL_EXPIRED` | 403 | 试用到期 |
| `PRODUCT_LIMIT_REACHED` | 403 | 产品数达上限 |
| `UNAUTHORIZED` | 401 | 未登录或 token 无效 |

开发模式 `AUTH_DEV_MODE=true` 时，`/api/auth/sms/send` 响应含 `devCode`。

### 5.1 健康检查

```
GET /api/health
→ { "ok": true, "version": "1.1.0", "db": "sqlite" | "mysql", "aiQueue": { ... } }
```

### 5.2 车辆

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/vehicles` | 列表；query: `status`, `keyword`, `sortBy`, `limit`, `offset` |
| POST | `/api/vehicles` | 创建草稿 |
| GET | `/api/vehicles/:id` | 详情 |
| PUT | `/api/vehicles/:id` | 更新 |
| PATCH | `/api/vehicles/:id/status` | 状态：`draft` / `on_sale` / `sold` |
| DELETE | `/api/vehicles/:id` | 删除 |
| POST | `/api/vehicles/batch-status` | 批量改状态 |
| POST | `/api/vehicles/batch-delete` | 批量删除 |
| POST | `/api/vehicles/:id/photos` | 上传照片（multipart：`category`, `slotKey`, `photo`） |
| DELETE | `/api/vehicles/:id/photos/:photoId` | 删除照片 |

**车辆 JSON 扩展字段（v3）**：`hasPoster`, `lastPosterGeneratedAt`, `photoCount`, `shareCount`

### 5.3 卖点与润色

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/selling-points/generate` | **v1.2** LLM 根据描述/车型/售价生成卖点标签 |
| GET | `/api/selling-points/recommend` | query: `brandModel`, `limit`（关键词推荐，备用） |
| POST | `/api/polish/description` | 描述润色（DeepSeek / 本地模板降级） |

**POST `/api/selling-points/generate` Request**：

```json
{
  "rawText": "21年上牌宝马X5，仅行驶3万公里，全程4S店保养",
  "brandModel": "宝马X5 2021款",
  "priceWan": 36.8,
  "limit": 12
}
```

**Response 200**：

```json
{
  "points": [
    { "text": "原版原漆", "emoji": "🛡️", "category": "appearance" }
  ],
  "source": "llm",
  "durationMs": 1200
}
```

| 规则 | 说明 |
|------|------|
| `source` | `llm` 或 `local_template`（无 Key / 失败且非 strict 模式） |
| 校验 | `rawText` 与 `brandModel` 至少一项非空 |
| 已移除 | `POST /api/vehicles/:id/recognize`（v1.2 删除） |

### 5.4 模板与长图

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/templates` | 启用中的海报模板列表 |
| POST | `/api/posters/compose` | **v1.1** 返回 SVG 结构与嵌入参数（客户端渲染 PNG） |
| POST | `/api/posters/render` | 服务端渲染 PNG（兼容/CLI；Web 主流程走 compose + 客户端） |
| POST | `/api/posters/confirm` | 确认正式发布，写入生成记录 |

**POST `/api/posters/compose` Request**（与 render 相同）：

```json
{
  "vehicleIds": ["uuid-1"],
  "templateId": "tpl_simple_01",
  "previewMode": true
}
```

**Response 200**（节选）：

```json
{
  "svgDoc": "<svg>...</svg>",
  "embed": { "maxEdge": 2880, "quality": 0.93 },
  "exportWidth": 1242,
  "width": 1242,
  "height": 4800,
  "qrcodeUrl": "/uploads/dealer/xxx.png",
  "generationId": null,
  "previewMode": true
}
```

| 规则 | 说明 |
|------|------|
| Web 主流程 | 前端 `renderPosterOnClient` 调用 compose，本地嵌入图片并导出 PNG |
| `previewMode: true` | 不写 `poster_generations` |
| 进度 | 客户端 `onProgress({ percent, label })`，percent 0–98 |

**POST `/api/posters/render` Request**：

```json
{
  "vehicleIds": ["uuid-1", "uuid-2"],
  "templateId": "tpl_simple_01",
  "previewMode": true
}
```

**Response 200**：

```json
{
  "generationId": "uuid-or-null",
  "imageBase64": "...",
  "width": 375,
  "height": 4200,
  "durationMs": 1200,
  "blockCount": 8,
  "fileSize": 890000,
  "mimeType": "image/png",
  "format": "png",
  "previewMode": true
}
```

| 规则 | 说明 |
|------|------|
| `previewMode: true` | 不写 `poster_generations`；`generationId` 为 null |
| `previewMode: false` | 写生成记录；更新车辆 `hasPoster` |
| PNG 存储 | **不落盘**；由客户端 IndexedDB / 图库存 Base64 |

### 5.5 经销商与分享

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/dealer` | 当前经销商资料 |
| PUT | `/api/dealer` | 更新姓名/电话/微信等 |
| POST | `/api/dealer/qrcode` | 上传微信二维码（multipart） |
| POST | `/api/share/default-copy` | 预填分享文案 |
| POST | `/api/share/record` | 记录分享行为 |
| GET | `/api/stats` | 车辆状态统计 + 分享次数 + **已发布车源数** |

**GET `/api/stats` Response**：

```json
{
  "counts": { "draft": 2, "on_sale": 5, "sold": 1 },
  "shareTotal": 12,
  "posterTotal": 6
}
```

| 字段 | 说明 |
|------|------|
| `posterTotal` | **v1.2** 有正式长图记录（`is_preview=0`）的**不重复车源数**，非生成次数 |
| `counts` | 按 `vehicles.status` 分组计数 |
| `shareTotal` | `share_records` 表总行数 |

### 5.6 通用错误体

```json
{ "error": { "code": "VEHICLE_NOT_FOUND", "message": "..." } }
```

| code | HTTP | 场景 |
|------|------|------|
| `VEHICLE_NOT_FOUND` | 404 | 车辆不存在 |
| `INVALID_ARGUMENT` | 400 | 参数缺失 |
| `INVALID_STATUS` | 400 | 非法状态 |
| `RENDER_FAILED` | 500 | 长图渲染失败 |
| `POLISH_FAILED` | 500 | 润色失败 |
| `EMPTY_INPUT` | 400 | 卖点生成缺少描述与车型 |
| `TRIAL_EXPIRED` | 403 | 试用到期（v1.1） |
| `PRODUCT_LIMIT_REACHED` | 403 | 产品数达上限（v1.1） |
| `GENERATE_FAILED` | 500 | 卖点生成失败 |

### 5.7 前端模块对照

| 模块 | 文件 | 职责 |
|------|------|------|
| API 客户端 | `public/js/api.js` | 封装上述 REST |
| 配置 | `public/js/config.js` | 服务器地址、原生 App 检测 |
| 长图缓存 | `public/js/posterCache.js` | IndexedDB |
| 多车图库 | `public/js/galleryStore.js` | 自动入库 `YYYYMMDD-NN` |
| 保存相册 | `public/js/posterSave.js` | Web Share / 下载 |
| 进度动画 | `public/js/posterProgress.js` | 生成中 UI |

---

## 6. 认证与安全

| 场景 | 方案 |
|------|------|
| LLM 直连 | Key 存 Keychain / EncryptedSharedPreferences |
| BFF | `Authorization: Bearer {device_token}`，设备注册接口二期补充 |
| 请求签名 | BFF 可选 HMAC：`X-Timestamp` + `X-Signature` |
| 证书固定 | 生产环境对 BFF 域名启用 pinning |

---

## 7. 版本与兼容

| 字段 | 策略 |
|------|------|
| App `X-Client-Version` | BFF 按版本返回模板列表 |
| layoutSchema `schemaVersion` | 渲染引擎向后兼容 ≥1 个主版本 |
| DB `schema_version` | 迁移脚本递增，见 DDL 文档 |

---

## 8. 接口与页面对照

| 页面 | 主要调用 |
|------|----------|
| page-upload | MediaUploadService |
| page-desc | CopyPolishService、`generateSellingPoints`、`desc-compose`（客户端） |
| page-template | PosterRenderService, ShareBridge |
| page-list | VehicleRepository, PosterRenderService |
| page-gallery | `galleryStore.js`（多车）、VehicleRepository（单车 hasPoster） |
| page-profile | DealerProfile 存储、`GET /api/stats`、AnalyticsPort |

---

*文档结束*
