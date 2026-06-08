## pm-editor — 参数化模型编辑器

轻量级独立编辑器，用于 `@designer/pm-engine` 的参数化定义。
通过 Three.js 在 3D 场景中渲染 pm-engine 的 `ParametricDef` JSON 数据。

![pm-editor 界面截图](image.png)

## 坐标系

- pm-engine / JSCAD: XY 为地面，Z 轴朝上（建筑坐标）
- Three.js 渲染器: XZ 为地面，Y 轴朝上（通过 `ARCH_TO_THREE` 矩阵绕 X 轴旋转 −90°）

## DOM 节点

- `editor-3d`：Three.js WebGLRenderer 画布（全屏视口）
- `editor-ui`：React UI 覆盖层（根节点 `pointer-events-none`，交互子元素自行开启）

## UI 布局

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Header                                                                  │
│  ┌─ 左 ───────────────────────────────────────┐  ┌─ 右 ──────────────┐  │
│  │ h1: Parametric Model Editor                │  │ 共 N 个实体       │  │
│  │ p:  点击 3D 场景中的实体以选中 · 左侧面板… │  │                   │  │
│  └────────────────────────────────────────────┘  └───────────────────┘  │
│                                                                          │
│  ┌─ 左侧面板 (w-80) ──┐           3D 视口              ┌─ 右侧面板 ─┐  │
│  │ 实体列表            │        （全屏画布）             │DefDataPanel│  │
│  │  · 颜色缩略图       │                                │ (JSON 数据)│  │
│  │  · type #index      │                                │            │  │
│  │  · 颜色/粗糙度/金属 │                                │            │  │
│  │  · 删除按钮         │                                │            │  │
│  │─────────────────────│                                │            │  │
│  │ VariablesPanel      │                                │            │  │
│  │  · 约束变量滑块     │                                │            │  │
│  │  · 添加/删除变量    │                                │            │  │
│  │─────────────────────│                                │            │  │
│  │ 选中实体详情        │                                │            │  │
│  │  · TransformEditor  │                                │            │  │
│  │  · MaterialEditor   │                                │            │  │
│  │  · ParamsEditor     │                                │            │  │
│  │  (含约束绑定)       │                                │            │  │
│  └─────────────────────┘                                └────────────┘  │
│                                                                          │
│  ┌─ 底部工具栏（水平居中）────────────────────────────────────────────┐  │
│  │ PRIMITIVE_3D_PRESETS 按钮：                                        │  │
│  │ 正方体 · 长方体 · 圆柱 · 椭圆柱 · 椭球 · 测地球                    │  │
│  │ 圆角方体 · 圆角圆柱 · 球体 · 环体 · 多面体                        │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 组件职责

| 组件 | 位置 | 职责 |
|------|------|------|
| Header | 顶部 (flex) | 标题、副标题、实体计数 |
| 左侧面板 | `absolute top-20 left-4 w-80` | 实体列表 + 约束变量 + 选中详情 |
| `DefDataPanel` | 右侧 (absolute) | 实时展示所有 `ParametricDef[]` 的 JSON 数据 |
| 底部工具栏 | `absolute bottom-4` 水平居中 | 添加 3D 基本体（触发 `AddModelCommand` 交互放置） |
| `TransformEditor` | 左侧面板内（选中时） | 编辑 position / rotation / scale |
| `MaterialEditor` | 左侧面板内（选中时） | 编辑 color / roughness / metalness / map |
| `ParamsEditor` | 左侧面板内（选中时） | 编辑几何参数，支持约束变量绑定 |
| `VariablesPanel` | 左侧面板内 | 约束变量的增删、滑块调值 |

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
