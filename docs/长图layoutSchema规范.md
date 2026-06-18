# 二手车信息发布助手 — 长图 layoutSchema 规范

**版本**: v1.2  
**日期**: 2026-06-10  
**关联文档**: [系统架构设计.md](../系统架构设计.md)、[API设计.md](./API设计.md)、[开发更新日志.md](./开发更新日志.md)

---

## 1. 目的

`layoutSchema` 是海报模板的核心描述文件（JSON），供 `poster-render` 模块解析并绘制单车长图 / 多车超长图。本文定义：

- Schema 版本与顶层结构
- 区块（Block）类型与属性
- 数据绑定（DataBinding）
- 多车模式与分块渲染约定
- 示例文件

**画布基准宽度**：`750` px（2x 设计稿），导出时按 `scale` 缩放。

---

## 2. 文件约定

| 项 | 值 |
|----|-----|
| 扩展名 | `.json` |
| 存放路径 | `assets/templates/{templateId}.json` |
| schemaVersion | 当前 `1` |
| 编码 | UTF-8 |

---

## 3. 顶层结构

```json
{
  "schemaVersion": 1,
  "templateId": "tpl_business_01",
  "name": "商务蓝",
  "style": "business",
  "canvas": {
    "width": 750,
    "backgroundColor": "#FFFFFF",
    "exportMaxWidth": 1080,
    "exportMaxBytes": 8388608
  },
  "theme": {
    "primaryColor": "#1A3A5C",
    "accentColor": "#07C160",
    "priceColor": "#F53F3F",
    "textPrimary": "#1A1A1A",
    "textSecondary": "#999999",
    "fontFamily": "PingFang SC",
    "titleFontSize": 34,
    "bodyFontSize": 28,
    "captionFontSize": 22
  },
  "mode": "single",
  "blocks": [],
  "multiVehicle": null
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `mode` | `"single"` \| `"multi"` | 单车 / 多车入口模板 |
| `blocks` | `Block[]` | 单车模式区块顺序 |
| `multiVehicle` | `MultiVehicleConfig` | 多车模式配置，`mode=multi` 时必填 |

---

## 4. Block 通用字段

每个区块对象均包含：

```json
{
  "id": "hero_image",
  "type": "hero_image",
  "height": 420,
  "padding": { "top": 0, "right": 32, "bottom": 16, "left": 32 },
  "visible": true,
  "bind": {}
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 区块唯一标识，用于分块缓存 key |
| `type` | BlockType | 见 §5 |
| `height` | number \| `"auto"` | 固定高或按内容撑开 |
| `padding` | Padding | 内边距 px |
| `visible` | boolean \| Expression | 条件显示 |
| `bind` | DataBinding | 数据字段映射 |
| `style` | BlockStyle | 可选覆盖 theme |

---

## 5. Block 类型定义

### 5.1 BlockType 枚举

| type | 用途 |
|------|------|
| `cover_header` | 多车顶部总标题 |
| `hero_image` | 主图（首图或指定 slot） |
| `vehicle_title` | 车型 + 年款 |
| `vehicle_code` | 唯一编号 |
| `selling_points` | 卖点列表（带 Emoji） |
| `vehicle_description` | 车况介绍（`buildPosterDescription`：正文 + 末尾 `售价：X万元`） |
| `photo_grid` | 实拍图网格（默认除主图外**全部**照片；`maxCount>0` 时才限制） |
| `specs_table` | 参数表（年/里程/排量） |
| `price_tag` | 价格区 |
| `divider` | 多车分割线 |
| `footer_cta` | 底部引导 + 二维码 |
| `spacer` | 空白间距 |

---

### 5.2 hero_image

```json
{
  "id": "hero",
  "type": "hero_image",
  "height": 420,
  "bind": {
    "imageSource": { "slot": "exterior.front", "fallback": "any" }
  },
  "style": {
    "borderRadius": 16,
    "objectFit": "cover"
  }
}
```

| bind 字段 | 说明 |
|-----------|------|
| `imageSource.slot` | `category.slotKey`，如 `exterior.front` |
| `imageSource.fallback` | `any` 取任意首张；`thumb` 用 thumb_path |

---

### 5.3 vehicle_title

```json
{
  "id": "title",
  "type": "vehicle_title",
  "height": "auto",
  "bind": {
    "title": "brandModel",
    "subtitle": "year"
  },
  "style": {
    "titleFontWeight": 600,
    "subtitleTemplate": "{year}款"
  }
}
```

---

### 5.4 vehicle_code

```json
{
  "id": "code",
  "type": "vehicle_code",
  "height": 40,
  "bind": { "code": "code" },
  "style": {
    "align": "right",
    "fontSize": 20,
    "color": "#999999",
    "prefix": "编号: "
  }
}
```

---

### 5.5 selling_points

```json
{
  "id": "points",
  "type": "selling_points",
  "height": "auto",
  "bind": {
    "points": "sellingPoints",
    "maxCount": 5
  },
  "style": {
    "bullet": "none",
    "lineHeight": 1.6,
    "showEmoji": true
  }
}
```

---

### 5.6 photo_grid

```json
{
  "id": "grid",
  "type": "photo_grid",
  "height": "auto",
  "bind": {
    "photos": { "excludeSlot": "exterior.front", "maxCount": 4 }
  },
  "style": {
    "columns": 2,
    "gap": 12,
    "cellAspectRatio": "4:3",
    "borderRadius": 8
  }
}
```

---

### 5.7 specs_table

```json
{
  "id": "specs",
  "type": "specs_table",
  "height": "auto",
  "bind": {
    "rows": [
      { "label": "年份", "field": "year", "suffix": "款" },
      { "label": "里程", "field": "mileageKm", "suffix": "公里" },
      { "label": "售价", "field": "priceWan", "suffix": "万" }
    ]
  },
  "style": {
    "layout": "inline",
    "separator": " | "
  }
}
```

---

### 5.8 price_tag

```json
{
  "id": "price",
  "type": "price_tag",
  "height": 120,
  "bind": {
    "price": "priceWan",
    "tags": "priceTags"
  },
  "style": {
    "priceFontSize": 48,
    "currency": "¥",
    "unit": "万",
    "tagFontSize": 22
  }
}
```

---

### 5.9 divider（多车）

MVP 实现：**编号 + 分割线结合**，高度 72px，3px 主题色实线，编号置于白色圆角徽章。

```json
{
  "id": "div",
  "type": "divider",
  "height": 72,
  "style": {
    "lineStyle": "solid",
    "lineWidth": 3,
    "lineColor": "{{theme.accentColor}}",
    "showNextVehicleCode": true,
    "codePrefix": "编号 ",
    "backgroundColor": "#F8FAFC"
  }
}
```

渲染器在分割线中央显示**下一台**车辆的 `vehicle.code`；每台车区块顶部另有独立 `vehicle_code` 区块显示当前车编号。

---

### 5.10 vehicle_description

```json
{
  "id": "desc",
  "type": "vehicle_description",
  "height": "auto",
  "bind": {
    "title": { "literal": "📝 车况介绍" },
    "text": "vehicle.polishedDescription|vehicle.extraDescription"
  },
  "style": {
    "fontSize": 26,
    "lineHeight": 1.5,
    "color": "#333333"
  }
}
```

**v1.2 渲染约定**：

- 渲染器不直接绑定原始字段，而是调用 `descCompose.buildPosterDescription(vehicle)`
- 正文取 `polishedDescription || extraDescription`（已含用户点选卖点融入后的完整文案）
- 若 `priceWan > 0` 且正文未含售价行，末尾追加 `\n\n售价：{priceWan}万元`
- 描述页 `#desc-preview` 与长图使用同一合成逻辑，保证所见即所得
- 文本为空时不渲染该区块

---

### 5.11 footer_cta

```json
{
  "id": "footer",
  "type": "footer_cta",
  "height": "auto",
  "bind": {
    "title": { "literal": "扫码咨询" },
    "subtitle": "dealerProfile.shopName",
    "phone": "dealerProfile.contactPhone",
    "qrcode": "dealerProfile.qrcodeUrl",
    "showCodeOnFooter": true
  },
  "style": {
    "backgroundColor": "#F5F5F5",
    "qrcodeSize": 160
  }
}
```

**布局顺序（MVP）**：标题 → 姓名 → 电话 → 二维码 → **车辆编号（二维码下方）**。`height` 使用 `"auto"` 动态计算，避免编号与二维码重叠。

多车模式 `subtitle` 可绑定 `{ "literal": "全部可议，欢迎询价" }`。

---

### 5.11 cover_header（多车顶部）

```json
{
  "id": "multi_cover",
  "type": "cover_header",
  "height": 200,
  "bind": {
    "title": { "template": "今日好车推荐" },
    "subtitle": { "template": "精选 {vehicleCount} 台优质车源" }
  },
  "style": {
    "backgroundGradient": ["#07C160", "#95EC69"],
    "titleColor": "#FFFFFF"
  }
}
```

---

## 6. 多车模式 MultiVehicleConfig

```json
{
  "multiVehicle": {
    "vehicleBlockTemplate": [
      { "id": "v_hero", "type": "hero_image", "height": 360, "bind": { "imageSource": { "slot": "exterior.front" } } },
      { "id": "v_title", "type": "vehicle_title", "height": "auto", "bind": { "title": "brandModel", "subtitle": "year" } },
      { "id": "v_code", "type": "vehicle_code", "height": 36, "bind": { "code": "code" } },
      { "id": "v_points", "type": "selling_points", "height": "auto", "bind": { "points": "sellingPoints", "maxCount": 3 } },
      { "id": "v_price", "type": "price_tag", "height": 100, "bind": { "price": "priceWan", "tags": "priceTags" } }
    ],
    "betweenBlocks": [
      { "id": "div", "type": "divider", "height": 48 }
    ],
    "headerBlocks": ["cover_header"],
    "footerBlocks": ["footer_cta"],
    "maxVehicles": 10
  }
}
```

**渲染顺序**：

```
headerBlocks
→ for each vehicle: vehicleBlockTemplate
→ betweenBlocks（最后一台后不加）
→ footerBlocks
```

---

## 7. DataBinding 字段映射

运行时 `RenderContext` 提供：

```typescript
interface RenderContext {
  vehicles: Vehicle[];
  dealer: DealerProfile;
  vehicleCount: number;
  scale: number;
}
```

| 绑定路径 | 来源 |
|----------|------|
| `brandModel` | `vehicle.brandModel` |
| `year` | `vehicle.year` |
| `code` | `vehicle.code` |
| `mileageKm` | `vehicle.mileageKm` |
| `priceWan` | `vehicle.priceWan` |
| `priceTags` | `vehicle.priceTags` |
| `sellingPoints` | `vehicle.sellingPoints[]` |
| `dealerProfile.*` | 全局经销商 |
| `{ "literal": "..." }` | 常量 |
| `{ "template": "..." }` | 支持 `{vehicleCount}` 占位符 |

---

## 8. 条件可见 visible

```json
"visible": {
  "when": "vehicle.hasFrunkSlot",
  "eq": true
}
```

或简写：`"visible": "vehicle.priceWan"`（truthy 显示）。

---

## 9. 分块渲染与缓存

| 规则 | 说明 |
|------|------|
| Block ID | 多车时 `"{vehicleId}_{blockId}"` 作为缓存 key |
| 高度测量 | `height: "auto"` 块先 dry-run 排版得高 |
| 预览 | 仅渲染 `scrollOffset ± 1.5 * viewport` 内块 |
| 导出 | 全量顺序 stitch，JPEG 质量迭代至 ≤ exportMaxBytes |

**块输出元数据**（内存或临时文件）：

```json
{
  "blockId": "v1_hero",
  "yOffset": 0,
  "height": 420,
  "bitmapPath": "/cache/render/v1_hero.png"
}
```

---

## 10. 完整示例：单车简约模板

`assets/templates/tpl_simple_01.json`：

```json
{
  "schemaVersion": 1,
  "templateId": "tpl_simple_01",
  "name": "简约白",
  "style": "simple",
  "canvas": {
    "width": 750,
    "backgroundColor": "#FFFFFF",
    "exportMaxWidth": 1080,
    "exportMaxBytes": 8388608
  },
  "theme": {
    "primaryColor": "#1A1A1A",
    "accentColor": "#07C160",
    "priceColor": "#F53F3F",
    "textPrimary": "#1A1A1A",
    "textSecondary": "#999999",
    "fontFamily": "PingFang SC",
    "titleFontSize": 34,
    "bodyFontSize": 28,
    "captionFontSize": 22
  },
  "mode": "single",
  "blocks": [
    {
      "id": "hero",
      "type": "hero_image",
      "height": 420,
      "padding": { "top": 24, "right": 32, "bottom": 0, "left": 32 },
      "bind": { "imageSource": { "slot": "exterior.front", "fallback": "any" } },
      "style": { "borderRadius": 16, "objectFit": "cover" }
    },
    {
      "id": "code_top",
      "type": "vehicle_code",
      "height": 36,
      "padding": { "top": 8, "right": 32, "bottom": 0, "left": 32 },
      "bind": { "code": "code" },
      "style": { "align": "right", "fontSize": 20, "color": "#999999", "prefix": "编号: " }
    },
    {
      "id": "title",
      "type": "vehicle_title",
      "height": "auto",
      "padding": { "top": 16, "right": 32, "bottom": 8, "left": 32 },
      "bind": { "title": "brandModel", "subtitle": "year" },
      "style": { "titleFontWeight": 600, "subtitleTemplate": "{year}款" }
    },
    {
      "id": "points",
      "type": "selling_points",
      "height": "auto",
      "padding": { "top": 8, "right": 32, "bottom": 8, "left": 32 },
      "bind": { "points": "sellingPoints", "maxCount": 5 },
      "style": { "lineHeight": 1.6, "showEmoji": true }
    },
    {
      "id": "grid",
      "type": "photo_grid",
      "height": "auto",
      "padding": { "top": 8, "right": 32, "bottom": 8, "left": 32 },
      "bind": { "photos": { "excludeSlot": "exterior.front", "maxCount": 4 } },
      "style": { "columns": 2, "gap": 12, "cellAspectRatio": "4:3", "borderRadius": 8 }
    },
    {
      "id": "specs",
      "type": "specs_table",
      "height": "auto",
      "padding": { "top": 0, "right": 32, "bottom": 8, "left": 32 },
      "bind": {
        "rows": [
          { "label": "年份", "field": "year", "suffix": "款" },
          { "label": "里程", "field": "mileageKm", "suffix": "公里" }
        ]
      },
      "style": { "layout": "inline", "separator": " | " }
    },
    {
      "id": "price",
      "type": "price_tag",
      "height": 120,
      "padding": { "top": 8, "right": 32, "bottom": 16, "left": 32 },
      "bind": { "price": "priceWan", "tags": "priceTags" },
      "style": { "priceFontSize": 48, "currency": "¥", "unit": "万" }
    },
    {
      "id": "footer",
      "type": "footer_cta",
      "height": 280,
      "padding": { "top": 16, "right": 32, "bottom": 32, "left": 32 },
      "bind": {
        "title": { "literal": "扫码咨询" },
        "subtitle": "dealerProfile.shopName",
        "phone": "dealerProfile.contactPhone",
        "qrcode": "dealerProfile.qrcodePath",
        "showCodeOnFooter": true
      },
      "style": { "backgroundColor": "#F5F5F5", "qrcodeSize": 160 }
    }
  ],
  "multiVehicle": {
    "vehicleBlockTemplate": [
      { "id": "v_hero", "type": "hero_image", "height": 320, "padding": { "top": 16, "right": 32, "bottom": 8, "left": 32 }, "bind": { "imageSource": { "slot": "exterior.front" } }, "style": { "borderRadius": 12, "objectFit": "cover" } },
      { "id": "v_title", "type": "vehicle_title", "height": "auto", "padding": { "top": 0, "right": 32, "bottom": 4, "left": 32 }, "bind": { "title": "brandModel", "subtitle": "year" } },
      { "id": "v_code", "type": "vehicle_code", "height": 32, "padding": { "top": 0, "right": 32, "bottom": 4, "left": 32 }, "bind": { "code": "code" }, "style": { "align": "left", "fontSize": 18, "prefix": "编号: " } },
      { "id": "v_points", "type": "selling_points", "height": "auto", "padding": { "top": 4, "right": 32, "bottom": 4, "left": 32 }, "bind": { "points": "sellingPoints", "maxCount": 3 } },
      { "id": "v_price", "type": "price_tag", "height": 90, "padding": { "top": 4, "right": 32, "bottom": 12, "left": 32 }, "bind": { "price": "priceWan", "tags": "priceTags" }, "style": { "priceFontSize": 40 } }
    ],
    "betweenBlocks": [
      { "id": "div", "type": "divider", "height": 40, "style": { "lineStyle": "dashed", "lineColor": "#E5E5E5" } }
    ],
    "headerBlocks": [
      {
        "id": "multi_cover",
        "type": "cover_header",
        "height": 180,
        "bind": {
          "title": { "literal": "今日好车推荐" },
          "subtitle": { "template": "精选 {vehicleCount} 台优质车源" }
        },
        "style": { "backgroundGradient": ["#07C160", "#95EC69"], "titleColor": "#FFFFFF" }
      }
    ],
    "footerBlocks": [
      {
        "id": "footer",
        "type": "footer_cta",
        "height": 260,
        "bind": {
          "title": { "literal": "扫码咨询全部车源" },
          "subtitle": { "literal": "全部可议，欢迎询价" },
          "phone": "dealerProfile.contactPhone",
          "qrcode": "dealerProfile.qrcodePath"
        }
      }
    ],
    "maxVehicles": 10
  }
}
```

---

## 11. 校验规则（CI / 打包前）

| 检查项 | 规则 |
|--------|------|
| schemaVersion | 必须为已支持版本 |
| blocks 非空 | `mode=single` 时 |
| multiVehicle | `mode=multi` 或任意模板均可含，供引擎切换 |
| 必填 bind | hero_image 必有 imageSource |
| height | 数值 ≥ 0 或 `"auto"` |
| maxVehicles | 1~10 |

建议使用 JSON Schema 文件 `layout-schema-v1.json` 做自动化校验（可选实现）。

---

## 12. 版本演进

| schemaVersion | 变更 |
|---------------|------|
| 1 | 初版 Block 集合 |
| 2（规划） | `video_cover` 区块、主题 `darkMode` |
| 2（规划） | `bind` 表达式语言（JsonLogic） |

渲染器须支持：**读取高版本时降级忽略未知 block type**。

---

*文档结束*
