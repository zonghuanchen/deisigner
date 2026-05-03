## 相机管理数据

# 初始化

初始化创建三个相机，正交相机、3d透视相机、漫游透视相机，它们的参数如下：

- 正交相机 - type: 正交,position: (0,0,1) , target: (0, 0, 0)
- 3d透视相机（默认相机） - type: 透视, position: (0,5,5), target: (0, 0, 0), mode: 3d模式
- 漫游透视相机 - type: 漫游, position: (0, 1, 0), target: (0, 0, 0), mode: 漫游模式 

# 方法

- switch - 通过一个声明的const切换三个相机，切换之后出发change时间