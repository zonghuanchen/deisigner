## pm-editor — 参数化模型编辑器

轻量级独立编辑器，用于 `@designer/pm-engine` 的参数化定义。
通过 Three.js 在 3D 场景中渲染 pm-engine 的 `ParametricDef` JSON 数据。

## 坐标系

- pm-engine / JSCAD: XY 为地面，Z 轴朝上（建筑坐标）
- Three.js 渲染器: XZ 为地面，Y 轴朝上（通过 `ARCH_TO_THREE` 矩阵绕 X 轴旋转 −90°）

## DOM 节点

- `editor-3d`：Three.js WebGLRenderer 画布（全屏视口）
- `editor-ui`：React UI 覆盖层（根节点 `pointer-events-none`，交互子元素自行开启）

## 依赖链

```
pm-editor → pm-engine → @jscad/modeling
pm-editor → three（直接使用，不依赖 @designer/app）
pm-editor → react + @heroui/react（UI）
```

pm-editor **不依赖** `@designer/app`，直接使用 Three.js 以实现最小化的独立查看器。

## 核心模块

| 文件 | 职责 |
|------|------|
| `src/Scene3D.ts` | Three.js 场景、相机、轨道控制器、灯光、网格、渲染循环 |
| `src/jscadToThree.ts` | 将 JSCAD `geom2`/`geom3` 转换为 Three.js `BufferGeometry`，含坐标变换 |
| `src/App.tsx` | 初始化 3D 场景、构建 pm-engine 几何体、渲染 UI 覆盖层 |

## 数据流

1. `ParametricDef[]` JSON → `ParametricModeler.buildGeometries()` → JSCAD 几何体
2. JSCAD 几何体 → `buildMeshGroup()` → Three.js `Group`（包含 `Mesh`）
3. 将 Group 添加到 `Scene3D`，通过 `focusOn()` 自动聚焦相机

## 常用命令

```bash
npm run dev --workspace=@designer/pm-editor    # 开发服务器（端口 3008）
npm run build --workspace=@designer/pm-editor  # 生产构建
```

## 约束

- 3D 网格不使用阴影，仅用环境光 + 方向光配合颜色
- 坐标变换统一在 `jscadToThree.ts` 中处理；场景对象中禁止混用建筑坐标和 Three.js 坐标
- UI 覆盖层根节点设置 `pointer-events-none`；交互元素通过 `pointer-events-auto` 自行开启
