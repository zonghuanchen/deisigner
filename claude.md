## 项目描述
这是一个在线3d家装设计软件，支持bim、软装、参数化、定制、铺贴等功能

## 项目说明

### 坐标

- src/core: 数据建模用xy面作为地面，即z轴朝上
- src/app: 3d展示层用three.js的坐标，即y朝上

## dom

- editor-3d: 3d展示对应dom节点
- editor-2d: 2d展示对应的dom节点
- editor-ui: ui界面展示对应的dom节点

## 源代码目录
-src
--core 数据建模目录，纯数据代码，不包含展示层的逻辑
--app 展示层逻辑，包含3d、2d、ui
--editor 项目代码，把core和app引入进来，组装成整个设计软件