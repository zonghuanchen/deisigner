# @designer/pm-editor

参数化模型编辑器界面，用于构造和编辑参数化模型（ParametricModel）及定制模型。

## 技术栈

- React 18 + TypeScript
- HeroUI (UI 组件库)
- Tailwind CSS
- Webpack 5 (dev server + build)

## 依赖关系

```
pm-editor → pm-engine → core
```

- `@designer/core` — 数据建模层
- `@designer/pm-engine` — 参数化建模引擎（节点图、JSCAD 几何）

## 开发

```bash
# 启动开发服务器 (端口 3008)
npm run dev --workspace=@designer/pm-editor

# 构建
npm run build --workspace=@designer/pm-editor

# 类型检查
npm run type-check --workspace=@designer/pm-editor
```

## 目录结构

```
packages/pm-editor/
├── src/
│   ├── index.tsx       # 入口
│   ├── index.css       # 全局样式 (Tailwind)
│   └── App.tsx         # 根组件
├── index.html          # HTML 模板
├── package.json
├── tsconfig.json       # TS 项目引用 (composite)
├── tsconfig.webpack.json  # webpack ts-loader 用
├── webpack.config.js
├── tailwind.config.js
└── postcss.config.js
```
