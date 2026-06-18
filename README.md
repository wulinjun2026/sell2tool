# 通用产品销售助手 — 本地运行指南

面向个体商户的产品营销工具：**结构化拍照 → AI 文案 → 长图生成 → 保存分享**。Web + PWA，生产环境 MySQL 多用户隔离。

**当前版本**：v1.1.0 · 详见 [docs/开发更新日志.md](./docs/开发更新日志.md)

## 功能概览

- ✅ 手机号 + 短信验证码登录，JWT 鉴权，按用户隔离产品数据
- ✅ 免费试用 20 天 / 最多 40 个产品；付费账号解除限制
- ✅ 三步结构化上传（外观 / 细节 / 补充，13 槽位；支持一次选多张）
- ✅ 产品唯一编号 `CCyyyyMMddHHmmNNN`
- ✅ 描述页：产品名/售价 + AI 卖点生成 + 点选融入正文 + AI 润色
- ✅ 长图生成：服务端 compose + **客户端 PNG 导出**（多车超长图、IndexedDB 缓存）
- ✅ 生成进度分阶段同步（98% 后细粒度等待动画至 99.9%）
- ✅ 分享 / 保存 PNG（Web Share、下载、Capacitor 相册）
- ✅ 产品管理（在售 / 已售 / 草稿、批量操作、搜索筛选）
- ✅ 「我的」：试用配额、联系信息、长图底部二维码
- ✅ AI 请求队列、上传压缩流水线、长图嵌入并行优化

## 环境要求

- Node.js >= 18
- 本地开发：SQLite（零配置）
- 生产部署：MySQL / MariaDB（见 `.env.example`）

## 快速启动

```bash
cd 通用助手
npm install
cp .env.example .env   # 可选，本地默认 SQLite
npm start
```

浏览器打开：**http://localhost:3000**

开发模式可在 `.env` 设置 `AUTH_DEV_MODE=true`，验证码在 API 响应 `devCode` 中返回。

## 运行测试

先启动服务，另开终端：

```bash
npm test
```

## 打包发布

```bash
npm run pack
# 输出 dist/used-car-assistant-1.1.0-linux-x64-*.tar.gz（含 Linux node_modules）
# 源码包可手动: tar --exclude node_modules --exclude data -czf dist/source.tar.gz .
```

## 目录结构

```
├── public/              # 前端 H5 + PWA（app.js、长图客户端渲染等）
├── server/              # Express API + MySQL/SQLite 迁移
├── assets/templates/    # 长图 layoutSchema 模板
├── docs/                # 技术文档
│   └── 备案文档/        # 网络备案说明材料
├── data/                # 本地运行时 DB 与上传（自动创建）
├── dist/                # 打包输出
├── tests/               # 自动化测试
└── scripts/             # 部署、打包脚本
```

## 主要 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| POST | /api/auth/sms/send | 发送登录验证码 |
| POST | /api/auth/sms/verify | 验证码登录 |
| GET | /api/auth/me | 当前用户与配额 |
| GET/POST | /api/vehicles | 产品列表 / 创建 |
| POST | /api/posters/compose | 长图 SVG 结构（客户端渲染 PNG） |
| POST | /api/selling-points/generate | AI 卖点生成 |
| POST | /api/polish | AI 润色 |
| GET | /api/stats | 统计与已发布数 |

完整契约见 [docs/API设计.md](./docs/API设计.md)。

## 测试流程建议

1. 「我的」→ 手机号登录（开发模式查看 devCode）
2. 「+ 录入」→ 上传外观照片（或一次选多张）
3. 填写描述 → AI 生成卖点 / 润色 → 选择模板
4. 预览长图 → 保存或分享
5. 产品列表勾选多件 → 「生成长图」验证多车超长图

## 文档索引

| 文档 | 说明 |
|------|------|
| [docs/README.md](./docs/README.md) | 技术文档总索引 |
| [docs/开发更新日志.md](./docs/开发更新日志.md) | 版本变更与 Bug 修复 |
| [docs/API设计.md](./docs/API设计.md) | REST API 契约 |
| [docs/数据库DDL.md](./docs/数据库DDL.md) | 表结构与迁移 |
| [docs/备案文档/](./docs/备案文档/) | 网络备案功能说明 |

## 说明

- 产品界面称「产品」，后端部分字段仍沿用 `vehicle` 命名（历史兼容）
- 微信原生 SDK 分享未接入；浏览器使用 Web Share + 下载
- LLM 无 Key 时自动本地模板降级；配置 `VISION_API_KEY` 启用 DeepSeek 等
