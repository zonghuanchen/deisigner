## 项目描述

在线3D设计软件，支持BIM、软装、参数化、定制、铺贴等功能。

## 坐标系

- core: XY面为地面，Z轴朝上
- app: Three.js坐标，Y轴朝上（数据向内旋转90°）

## DOM节点

- editor-3d / editor-2d / editor-ui：分别对应3D、2D、UI展示

## Monorepo 架构

npm workspaces，根目录 `"workspaces": ["packages/*"]`。

```
packages/
├── core/      # @designer/core — 数据建模层，入口 src/index.ts，peerDep: three
├── app/       # @designer/app  — 展示层(3D/2D/UI)，peerDep: three, pixi.js, react, @designer/core
└── editor/    # @designer/editor — 编辑器(private)，dep: @designer/core, @designer/app
```

依赖链：editor → app → core

- core/app 支持独立构建和 npm 发布，editor 仅用于开发
- tsconfig.json 通过 project references + paths 别名，开发时直引源码，发布时独立构建

## 常用命令

```bash
npm install                          # 安装依赖
npm run dev                          # 开发服务器
npm run build                        # 构建
npm run type-check                   # 类型检查
npm run build --workspace=@designer/core  # 单独构建某包
```

## 整体结构

`core/model` 数据对象注册到 `ModelRegistry`，`app/3d/display` 为其注册对应3D展示对象，创建时通过ID自动关联。

## 约束

- 3D mesh 不要阴影，有明暗和颜色即可
- UI 获取 model 数据使用 `useModelListener`
