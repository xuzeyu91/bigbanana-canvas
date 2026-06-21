<p align="center">
  <img src="web/public/logo.png" width="96" alt="BigBanana Canvas logo">
</p>

<h1 align="center">BigBanana Canvas (大香蕉画布工场)</h1>

<p align="center">
  <a href="https://linux.do/"><img src="https://img.shields.io/badge/Linux.do-Community-2b6de8?style=flat-square" alt="Linux.do"></a>
  <a href="VERSION"><img src="https://img.shields.io/badge/version-v0.2.0-2563eb?style=flat-square" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-f97316?style=flat-square" alt="License"></a>
  <a href="https://vercel.com/"><img src="https://img.shields.io/badge/Vercel-ready-000000?style=flat-square&logo=vercel" alt="Vercel ready"></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16.2-000000?style=flat-square&logo=nextdotjs" alt="Next.js"></a>
</p>

BigBanana Canvas 是一款面向 AI 视觉创作与资源编排的开源画布工作台。它把无限画布、多模态 AI 生成、参考图编辑、对话助手、在线/本地 Agent、提示词库和素材管理无缝集成于一个界面，让视觉创意从单次的“输入-生成”转变为可持续推演与连接的工业化工作流。

> **注意事项**
> 本项目目前处于快速开发阶段，不保证历史数据兼容。数据库结构、存储格式、接口协议均可能根据后续演进直接调整。当前版本极适合个人与本地部署使用，不建议直接用于多用户公网生产环境。
> 
> 二次开发、分发或提交 PR 请遵循 GNU Affero General Public License v3.0 开源协议，并保留 BigBanana Canvas 团队及原作者信息与前端标识。

---

## 核心功能

* **无限画布编排 (Infinite Canvas)**
  支持创建与管理多个画布项目。具备节点自由拖拽、四角等比/自由缩放、节点间逻辑连线、小地图定位、撤销与重做（覆盖节点、连线、视口、背景和助手会话等全维度操作）。支持全量导入与导出画布 JSON，并支持 dot、网格线和空白三种背景，适配浅色（Claude 暖色调）与深色（极简纯黑）两大主题。

* **多模态 AI 生成 (Multimodal Generation Flow)**
  浏览器前端直连本地配置的 Base URL 与 API Key（深度契合 BigBanana API / AntSK API 平台），完美兼容主流的大语言模型（如 GPT-5.5、GPT-5.2、Claude 4.6 Sonnet）、图像模型（如 Gemini 3.1 Flash Image、GPT Image 1.5）、音频模型（如 GPT Audio Mini）与视频模型（如 HappyHorse 1.0）。支持多参考图、多参考视频、多参考音频输入，完美支持 Seedance 2.0 异步视频生成工作流。

* **画布助手 (Canvas Assistant)**
  右侧折叠式智能助手，支持文本问答、视觉分析、节点直接引用。助手能自动识别用户选中节点及其上游节点的所有上下文逻辑。生成的文本、生成的单张或批量图片（支持叠卡预览及主图设置）可一键插回画布，使创作实现平滑的“生成-插回-再演进”循环。

* **本地与在线 Agent (Local & Online Agent)**
  集成了本地 Canvas Agent。通过本机的 MCP (Model Context Protocol) 协议连接 Codex、Claude Code 或其他本地开发工具。通过高级智能代理直接编辑、读取和批量改动画布节点，实现全自动的“Agent + Canvas”协作开发。

* **微级创作工具联动**
  顶部导航与移动端菜单直接提供生图工作台与视频创作台等专属外链，深度联动大香蕉创作工坊（BigBanana Image/Video Workbench），以便进行更高效的单次图像与视频处理。

* **提示词库与本地素材 (Prompt & Asset Center)**
  Next.js 路由自动拉取并内存缓存多个 GitHub 优秀 AI 提示词仓库。支持按标题搜索、按标签和来源多维筛选，可一键复制或将其加入“我的素材”中。内置本地素材库，支持保存、编辑、分类和直接拖入画布。

完整功能说明与最新特性参见 [功能介绍](docs/content/docs/overview/features.mdx)。

---

## 为什么选择 AntSK API？

本项目深度集成了 **AntSK API 平台（BigBanana API）**，为创作者提供一站式、高性能、超高性价比的 AI 多模态支撑：

* **全模型矩阵接入**
  统一 API 接口。完美支持大语言模型（如 GPT-5.5/5.2、Claude 4.6 Sonnet、Gemini 3.5）、图像生成模型（GPT Image 1.5/Gemini Image） and 视频生成模型（Sora-2、Veo-3.1、Vidu、HappyHorse 1.0、Seedance 2.0），免去在多个 AI 平台中反复切换的繁琐。
* **高性价比与极速响应**
  服务稳定、企业级 SLA 保障。以极其高性价比的价格按需计费，助力视觉设计师、视频创作者、AI 开发者无压力进行高频、大规模的连续迭代生图和分镜视频推演。
* **开发协议高度友好**
  提供完全兼容 OpenAI 协议的网关，支持零门槛直接对接，配合后台用量统计、可视化图表及历史版本追溯，构建最透明的 AI 研发基建。

---

## 技术栈

* **前端**: Next.js (App Router), React, TypeScript, Tailwind CSS, Ant Design (主题、卡片、边框、交互动画均根据浅色暖色/暗色纯黑深度调优), Zustand.
* **服务端代理**: 少量 Next.js Edge/Route 模块（第三方提示词抓取与 WebDAV 代理）。
* **自动化与 MCP**: 兼容 Model Context Protocol 的本地 Canvas Agent，支持与 Codex、Claude Code 等本地 Agent 直接整合。
* **部署**: 支持 Vercel 一键托管或本地/云端 Docker 镜像化快速部署。

---

## 快速开始

### 前提条件

推荐使用 Vercel 直接导入本项目仓库，项目根目录下已经完整配置了 `vercel.json`，会自动处理 `web/` 的前端构建。在整个执行链中，用户的 AI 密钥、Base URL 以及画布项目均安全保存在浏览器本地，或使用 WebDAV 自行进行云同步。

### 1. 本地启动

```bash
git clone https://github.com/shuyu-labs/BigBanana-Canvas.git
cd BigBanana-Canvas
cd web
bun install
bun run dev
```

启动后在浏览器中打开：

```text
http://localhost:3000
```

### 2. Docker 启动

如果你希望基于当前源码构建并运行 Docker 镜像：

```bash
docker build -t bigbanana-canvas .
docker run --rm -p 3000:3000 bigbanana-canvas
```

运行后在浏览器中打开：

```text
http://localhost:3000
```

### 3. 首次配置指引

1. 打开应用后，点击右上角的系统设置（齿轮图标）。
2. 在模型配置通道中，填写你的 API Key 以及 Base URL（使用 AntSK API / BigBanana API 或者其他 OpenAI 兼容渠道）。
3. 如果需要启用提示词同步，打开 `/prompts` 页面将自动抓取优秀开源库并生成在内存中。
4. 如需在不同设备、浏览器之间实现画布及素材的实时同步，可以在配置项中填入你的 WebDAV 配置。

---

## 项目文档

项目更详细的架构、部署和实操手册请参阅：

* [快速开始](docs/content/docs/overview/quick-start.mdx)
* [功能介绍](docs/content/docs/overview/features.mdx)
* [Render 部署](docs/content/docs/overview/render.mdx)
* [Docker 部署](docs/content/docs/overview/docker.mdx)
* [画布节点操作手册](docs/content/docs/canvas/canvas-node-manual.mdx)
* [画布快捷键](docs/content/docs/canvas/canvas-shortcuts.mdx)
* [本地 Canvas Agent 手册](canvas-agent/README.md)
* [待办事项](docs/content/docs/progress/todo.mdx)

---

## 开源协议与声明

* 本项目采用 GNU Affero General Public License v3.0 (AGPL-3.0) 协议开源，部分设计和功能细节参考 [BigBanana AI Director](https://github.com/shuyu-labs/BigBanana-AI-Director) 商业规范。关于商业闭源授权、商业版源码、私有化部署以及企业深度定制开发，请咨询商务合作。
* 画布项目、生图记录和我的素材在未配置 WebDAV 的情况下默认保存在浏览器本地，请做好重要画布的本地导出备份。

---
