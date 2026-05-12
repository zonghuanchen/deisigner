# OpenCascade.js 参数化建模 Demo

## 概述

本项目集成了 OpenCascade.js 用于参数化3D建模，支持创建家具、墙体、楼梯等建筑元素，并实时渲染到 Three.js 场景中。

## 核心架构

### 1. OpenCascadeHelper.ts
- **功能**: OpenCascade.js 初始化和实例管理
- **关键函数**:
  - `initOpenCascade()`: 异步初始化 OpenCascade WASM 模块
  - `getOpenCascade()`: 获取已初始化的实例
  - `isOpenCascadeInitialized()`: 检查初始化状态

### 2. ParametricModeler.ts
- **功能**: 参数化模型创建工具类
- **提供的模型**:
  - `createBox(width, depth, height)`: 创建立方体
  - `createCylinder(radius, height)`: 创建圆柱体
  - `createShelfUnit(width, depth, height, thickness, numShelves)`: 创建参数化柜体
  - `createTable(width, depth, height, topThickness, legSize)`: 创建参数化桌子
  - `createWallWithWindow(...)`: 创建带窗洞的墙体
  - `createStaircase(...)`: 创建参数化楼梯

### 3. ParametricDemo.ts
- **功能**: OpenCascade 到 Three.js 的集成演示
- **关键特性**:
  - OpenCascade 几何体到 Three.js Mesh 的转换
  - 可视化展示参数化模型
  - 完整的房间演示场景

## 使用示例

### 基础使用

```typescript
import { ParametricModeler } from './core/util';

// 初始化并创建模型
const shelfShape = await ParametricModeler.createShelfUnit(
  60,  // 宽度
  30,  // 深度
  120, // 高度
  2,   // 板材厚度
  4    // 层板数量
);
```

### 在3D场景中可视化

```typescript
import { ParametricDemo } from './app/3d/ParametricDemo';

// 设置场景（在 App 初始化时）
ParametricDemo.setScene3D(scene3D);

// 创建并显示参数化家具
await ParametricDemo.createAndShowShelf();
await ParametricDemo.createAndShowTable();
await ParametricDemo.createAndShowWallWithWindow();
await ParametricDemo.createAndShowStaircase();

// 创建完整房间演示
await ParametricDemo.createRoomDemo();
```

## Demo 按钮说明

在应用界面的 UI 面板中，提供以下按钮：

1. **Test OpenCascade** - 测试 OpenCascade 初始化
2. **Create Shelf** - 创建参数化柜体（棕色）
3. **Create Table** - 创建参数化桌子（橙色）
4. **Create Wall + Window** - 创建带窗洞的墙体（米色）
5. **Create Staircase** - 创建参数化楼梯（灰色）
6. **Create Room Demo** - 创建完整房间场景（包含地板、墙体、家具）

## 参数化建模原理

### CSG 操作（构造实体几何）

OpenCascade 使用 CSG 技术构建复杂模型：

1. **并集 (Fuse)**: 合并多个实体
   ```typescript
   const fuse = new oc.BRepAlgoAPI_Fuse_3(shape1, shape2);
   const result = fuse.Shape();
   ```

2. **差集 (Cut)**: 从一个实体中减去另一个
   ```typescript
   const cut = new oc.BRepAlgoAPI_Cut_3(wall, window);
   const result = cut.Shape();
   ```

3. **变换 (Transform)**: 移动、旋转实体
   ```typescript
   const transform = new oc.gp_Trsf_1();
   const vec = new oc.gp_Vec_4(x, y, z);
   transform.SetTranslation_1(vec);
   const location = new oc.TopLoc_Location_2(transform);
   const movedShape = shape.Moved(location);
   ```

### 网格化转换

OpenCascade 的 B-Rep 几何体需要转换为三角网格才能在 Three.js 中渲染：

```typescript
// 1. 网格化
const mesh = new oc.BRepMesh_IncrementalMesh_2(shape, 0.1);

// 2. 提取顶点和面
const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_FACE, oc.TopAbs_SHAPE);

// 3. 创建 Three.js BufferGeometry
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
geometry.setIndex(indices);
```

## 坐标系说明

- **OpenCascade**: Z轴向上（建筑坐标系）
- **Three.js**: Y轴向上（渲染坐标系）
- **转换**: 在 `archToThreeJS` 工具中处理坐标转换

## 扩展开发

### 添加新的参数化模型

1. 在 `ParametricModeler.ts` 中添加创建方法：

```typescript
static async createCustomModel(params: any) {
  const oc = await this.initialize();
  
  // 创建基础几何体
  let shape = new oc.BRepPrimAPI_MakeBox_2(...).Solid();
  
  // 使用 CSG 操作组合
  // ...
  
  return shape;
}
```

2. 在 `ParametricDemo.ts` 中添加可视化方法：

```typescript
static async createAndShowCustom() {
  const shape = await ParametricModeler.createCustomModel(params);
  const oc = await ParametricModeler.initialize();
  const mesh = await convertOcShapeToThreeMesh(oc, shape, '#color');
  
  if (mesh && this.scene3D) {
    this.scene3D.getScene().add(mesh);
    return mesh;
  }
}
```

## 性能优化建议

1. **网格精度**: 调整 `BRepMesh_IncrementalMesh_2` 的精度参数（默认 0.1）
2. **实例复用**: OpenCascade 实例会被缓存，避免重复初始化
3. **几何体合并**: 使用 CSG 操作前尽量简化几何体
4. **内存管理**: 及时释放不使用的 OpenCascade 对象

## 常见问题

### Q: WASM 加载失败？
A: 确保 `opencascade.js` 的 `.wasm` 文件正确复制到输出目录，检查 Rspack 配置。

### Q: 模型显示为黑色？
A: 检查法线是否正确提取，确保场景中有光源。

### Q: CSG 操作失败？
A: 确保参与操作的实体有重叠部分，检查 `IsDone()` 返回值。

### Q: 性能很慢？
A: 降低网格精度，减少面数，或使用更简单的几何体。

## 技术栈

- **OpenCascade.js**: 2.0.0-beta (WASM 版本的 OpenCASCADE CAD 内核)
- **Three.js**: 0.170.0 (3D 渲染引擎)
- **TypeScript**: 5.6.0 (类型安全)
- **Rspack**: 1.1.0 (构建工具)

## 参考资源

- [OpenCascade.js 官方文档](https://github.com/donalffons/opencascade.js)
- [OpenCASCADE 官方教程](https://dev.opencascade.org/doc/overview/html/)
- [Three.js 文档](https://threejs.org/docs/)
- [CSG 建模原理](https://en.wikipedia.org/wiki/Constructive_solid_geometry)
