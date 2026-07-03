# Mirscope（全身镜）

**Full Mirror, Full Insight — 全景镜面，全维洞察**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Pages](https://img.shields.io/badge/docs-GitHub%20Pages-6366f1)](https://mrsongzhaoyang.github.io/Mirscope/)

Mirscope 是一款 **Local First** 桌面端 AI Prompt 全景分析平台。自动采集 Cursor、Trae CN、Claude Code、CodeBuddy 等工具的对话数据，在本地完成归集、统计、可视化与智能分析，帮助你看清自己的 AI 使用习惯与 Prompt 成长轨迹。

> 所有对话数据默认仅存本地，API Key 加密存储，分析能力调用用户自有模型，无强制云端上传。

---

## 功能特性

| 模块 | 说明 |
|------|------|
| **Dashboard 全景看板** | 使用时段热力图、平台分布、活跃项目 Top 5、高频 Prompt 短语云 |
| **Timeline 时间线** | 按平台 / 项目浏览历史 Prompt，支持项目画像与 AI 分析面板 |
| **Explorer 资源浏览** | 全文检索、筛选、收藏与详情查看 |
| **Analytics 数据分析** | 多维统计、任务类型分布、模型使用分析 |
| **Settings 系统配置** | 连接器开关、手动同步、API Key 与偏好设置 |
| **AI 能力** | Prompt 评分、优化建议、项目 Playbook 生成（调用用户配置的模型 API） |

### 已支持的数据源

- **Cursor** — `cursorDiskKV` / Composer 会话
- **Trae CN** — Workspace 存储 + SQLCipher 加密 `database.db`（`history_v2`）
- **Claude Code** — 本地会话日志
- **CodeBuddy** — VS Code Fork 工作区数据

---

## 架构概览

```
┌──────────────────────────────────────────────┐
│              React UI (Renderer)              │
│  Dashboard · Timeline · Explorer · Settings  │
└──────────────────────┬───────────────────────┘
                       │ IPC
┌──────────────────────▼───────────────────────┐
│           Electron Main Process               │
│  ConnectorManager · SyncEngine · IPC Handlers │
└──────────────────────┬───────────────────────┘
                       │
     ┌─────────────────┼─────────────────┐
     ▼                 ▼                 ▼
 Connectors      Normalization       Database
 (插件采集)        (标准化/去重)      (SQLite + FTS5)
     │                 │                 │
     └─────────────────┼─────────────────┘
                       ▼
              Analytics · AI Provider
              (统计可视化)   (模型适配)
```

### 五层解耦设计

1. **UI Layer** — React 19 + Zustand + ECharts 可视化
2. **Connector Layer** — 插件化采集，Chokidar 文件监听 + 增量同步
3. **Normalization Layer** — 多平台格式统一、内容去重、Hash 稳定键
4. **Analytics Layer** — 统计聚合、热力图、项目画像
5. **AI Layer** — 统一 Provider，对接 OpenAI / Anthropic / 兼容 API

新增 AI 平台只需实现 Connector 插件，无需改动核心业务代码。

---

## 目录结构

```
Mirscope/
├── apps/desktop/          # Electron 桌面应用
│   ├── electron/          # 主进程、IPC、Connector 管理
│   ├── renderer/          # React 前端界面
│   └── preload/           # 预加载桥接
├── packages/
│   ├── connectors/        # 各平台采集插件
│   │   ├── cursor/
│   │   ├── trae/
│   │   ├── claude-code/
│   │   ├── codebuddy/
│   │   └── common/        # 公共基类、Trae 解密等
│   ├── sync-engine/       # 增量同步引擎
│   ├── normalization/     # 数据标准化
│   ├── database/          # Drizzle ORM + SQLite
│   ├── analytics/         # 分析逻辑
│   ├── ai-provider/       # AI 模型适配
│   └── shared/            # 共享类型与工具
├── docs/                  # GitHub Pages 介绍页
└── data/                  # 本地数据库（运行时生成，不入库）
```

---

## 快速开始

### 环境要求

- Node.js ≥ 20
- pnpm ≥ 9

### 安装与开发

```bash
git clone https://github.com/mrsongzhaoyang/Mirscope.git
cd Mirscope
pnpm install
pnpm dev
```

### 构建

```bash
pnpm build
pnpm build:desktop
```

### 同步说明

- 启动时自动检测已安装 IDE 并执行全量同步
- 源文件变更时通过文件监听增量同步
- 侧边栏「立即同步」可手动触发全量同步（已做内容级去重，重复点击不会膨胀数据）

---

## 技术栈

| 模块 | 技术 |
|------|------|
| 桌面框架 | Electron 33 |
| UI | React 19 + React Router |
| 构建 | electron-vite + Vite 5 |
| 状态管理 | Zustand |
| 数据库 | SQLite (better-sqlite3) + Drizzle ORM |
| 全文搜索 | SQLite FTS5 |
| 图表 | Apache ECharts + echarts-wordcloud |
| 文件监听 | Chokidar |

---

## 开源协议

本项目采用 [MIT License](LICENSE) 开源。

---

## 链接

- 仓库：<https://github.com/mrsongzhaoyang/Mirscope>
- 介绍页：<https://mrsongzhaoyang.github.io/Mirscope/>
- Release：<https://github.com/mrsongzhaoyang/Mirscope/releases>
