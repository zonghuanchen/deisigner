# 3D设计软件

基于Web的在线3D设计软件，支持BIM建模、软装布置、参数化设计、定制化及铺贴等功能。

![preview](screen.png)

## 核心特性

- **3D渲染**：基于Three.js
- **2D视图协同**：PixiJS平面视图，与3D场景实时同步
- **参数化建模**：墙体、门窗、家具
- **智能房间识别**：自动检测墙体围合区域
- **BIM数据模型**：数据驱动，模型与视图分离

## 技术栈

Three.js · PixiJS · React + TypeScript · Webpack · TailwindCSS · @jscad/modeling · npm workspaces

## Monorepo 架构

```
packages/
├── core/      # @designer/core — 数据建模层（纯数据）
├── app/       # @designer/app  — 展示层（3D/2D/UI）
├── editor/    # @designer/editor — 编辑器主程序（private）
├── pm-engine/ # @designer/pm-engine — 参数化建模引擎（基于 @jscad/modeling）
└── pm-editor/ # @designer/pm-editor — 参数化编辑器（独立轻量应用）
```

依赖链：
- editor → app → core
- pm-editor → pm-engine → core

- core/app 支持独立构建(`npm run build`)和发布(`npm run publish:dist`)
- editor 为 private，仅用于开发和最终构建
- TypeScript 通过 project references + paths 别名，开发时直引源码，发布时独立构建

## 快速开始

```bash
npm install          # 安装依赖
npm run dev          # 开发服务器 (localhost:3008)
npm run build        # 构建
npm run type-check   # 类型检查
```

## 整体架构

`core/model` 数据对象注册到 `ModelRegistry`。

`app/src/3d/display` 为每个模型注册3D展示对象，数据创建时通过ID自动关联3D展示。
`app/src/2d/display` 为每个模型注册2D展示对象，数据创建时通过ID自动关联2D展示。

## 参数化建模系统

基于 `@jscad/modeling` 的节点图参数化建模引擎，支持基本体、布尔操作、约束变量驱动几何体动态更新。

- **pm-engine**：参数化引擎核心，提供 `ParametricDef` 数据定义、`ConstraintSystem` 约束系统、几何体构建与 Three.js 转换工具
- **pm-editor**：轻量级独立编辑器，直接渲染 pm-engine 数据，仅依赖 Three.js + React

详细说明参见：
- [pm-editor README](packages/pm-editor/README.md) — 功能介绍与快速启动
- [pm-editor agents.md](packages/pm-editor/agents.md) — 架构设计与开发指南

## 许可证

MIT License
