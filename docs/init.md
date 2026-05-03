# 项目说明

这是一个在线3d家装设计软件，支持bim、软装、参数化、定制、铺贴等功能

# 技术栈

## 构建
使用node.js、rspack构建项目，

## 语言

typescript

## 3d展示

基于three做3d展示，使用three-bvh-csg对模型做布尔运算，使用cascade-core进行参数化建模

## 2d展示

基于pixi做2d展示

## ui展示

使用react展示ui，使用HeroUI库

# 目录结构

## 源代码目录
-src
--core 数据建模目录，纯数据代码，不包含展示层的逻辑
--app 展示层逻辑，包含3d、2d、ui
--editor 项目代码，把core和app引入进来，组装成整个设计软件

## 编译代码目录
dist目录，添加到.gitignore中