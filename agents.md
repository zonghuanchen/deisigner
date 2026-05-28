## 项目描述
这是一个在线3d家装设计软件，支持bim、软装、参数化、定制、铺贴等功能

## 项目说明

### 坐标

- src/core: 数据建模用xy面作为地面，即z轴朝上
- src/app: 3d展示层用three.js的坐标，即y朝上。建模数据超屏幕内旋转90度，就是three.js的坐标

## dom

- editor-3d: 3d展示对应dom节点
- editor-2d: 2d展示对应的dom节点
- editor-ui: ui界面展示对应的dom节点

## 源代码目录
-src
--core 数据建模目录，纯数据代码，不包含展示层的逻辑，core层的所有功能都通过core/index.ts向外暴露
--app 展示层逻辑，包含3d、2d、ui
--editor 项目代码，把core和app引入进来，组装成整个设计软件

## 整体结构设计

`core/model`数据层的每个对象都会注册到`ModelRegistry`中，`app/3d/display`下会对每个数据模型注册对应3d展示对象。当数据对象被创建时，`ModelRegistry`就会对应的去创建3d展示对象，并用数据对象的id做对应。

## 3d模型
为了性能,mesh不要阴影，有明暗和颜色即可

## model数据ui展示

使用`useModelListener`,获取model数据