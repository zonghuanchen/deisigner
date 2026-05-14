# 主要作用

添加一个构造参数化模型的函数，通过传入参数化数据结构，输出@jscad/modeling的参数化模型。

## 入参

入参是个数组，数据结构如下:

```typescript
type ShapeDef = {
    type: keyof typeof primitives; 
    params: Record<string, any>; // 传给primitives[type]执行的参数
};

type BooleanOp = {
    type: 'union' | 'subtract' | 'intersect'; // 布尔操作类型
    shape: ShapeDef;   // 形状的描述，但不包含bool 
};

type ParametricDef = {
    type: keyof typeof primitives; 
    params: Record<string, any>;
    bool?: BooleanOp[]; // 可选的布尔操作数组
};
```

## 出参

primitives生成的参数化模型数据（Geom2 或 Geom3）

## 函数位置

src\core\util\ParametricModeler.ts

## 使用示例

### 示例1：创建简单立方体

```typescript
import { ParametricModeler } from '@/core/util';

const model = ParametricModeler.buildParametricModel([
    {
        type: 'cuboid',
        params: { size: [10, 10, 10] }
    }
]);
```

### 示例2：创建带孔洞的立方体（使用布尔减法）

```typescript
import { ParametricModeler } from '@/core/util';

const model = ParametricModeler.buildParametricModel([
    {
        type: 'cuboid',
        params: { size: [20, 20, 20] },
        bool: [
            {
                type: 'subtract',
                shape: {
                    type: 'cylinder',
                    params: { radius: 5, height: 20 }
                }
            }
        ]
    }
]);
```

### 示例3：多个形状联合

```typescript
import { ParametricModeler } from '@/core/util';

const model = ParametricModeler.buildParametricModel([
    {
        type: 'cuboid',
        params: { size: [10, 10, 10] }
    },
    {
        type: 'sphere',
        params: { radius: 5 }
    }
]);
```

### 示例4：复杂组合（联合+减法）

```typescript
import { ParametricModeler } from '@/core/util';

const model = ParametricModeler.buildParametricModel([
    {
        type: 'cuboid',
        params: { size: [30, 20, 10] },
        bool: [
            {
                type: 'subtract',
                shape: {
                    type: 'cylinder',
                    params: { radius: 3, height: 10 }
                }
            }
        ]
    },
    {
        type: 'cuboid',
        params: { size: [10, 10, 10] }
    }
]);
```

## API说明

### ParametricModeler.buildParametricModel(definitions)

- **参数**: `definitions: ParametricDef[]` - 参数化定义数组
- **返回**: `ParametricResult | null` - 生成的几何模型
- **功能**: 根据传入的参数化定义数组构建模型，支持布尔运算

### 支持的primitive类型

所有@jscad/modeling的primitives都支持，包括但不限于：
- `cube`, `cuboid` - 立方体
- `sphere`, `ellipsoid` - 球体
- `cylinder`, `cylinderElliptic` - 圆柱体
- `cone` - 圆锥体
- `torus` - 圆环体
- `polygon`, `polyhedron` - 多边形/多面体
- `rectangle`, `square` - 矩形/正方形（2D）
- `circle`, `ellipse` - 圆形/椭圆（2D）

### 支持的布尔操作

- `union` - 并集
- `subtract` - 差集（减法）
- `intersect` - 交集