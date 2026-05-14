## 参数化模型

## 模型文件位置

core/model/ParametricModel.ts

## 属性

### params 

src\core\util\ParametricModeler.ts buildParametricModel函数的入参,设置时触发dirty事件

### position 

参数化模型位置,设置时触发transformChange事件

### rotation

参数化模型旋转,设置时触发transformChange事件

### scale

参数化模型缩放,设置时触发transformChange事件

## 方法

### getGraphData

根据params参数，使用buildParametricModel函数生成参数化模型

## 3d展示文件位置

app/3d/display/Parametric

## 更新和展示逻辑

监听model dirty事件，调用model的getGraphData方法，获得参数化模型，再将其转换为THREE.Mesh
监听model transformChange事件，将rts应用到mesh上

