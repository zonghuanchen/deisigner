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
└── editor/    # @designer/editor — 编辑器主程序（private）
```

依赖链：editor → app → core

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

`core/model` 数据对象注册到 `ModelRegistry`，`app/3d/display` 为每个模型注册3D展示对象，数据创建时通过ID自动关联3D展示。

## 许可证

MIT License
