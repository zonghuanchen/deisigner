# 说明

铺贴系统数据结构和实现定义

# 数据结构

## pattern对象

### 铺贴模式基类

#### 属性
 - tileWidth: 块宽度
 - tileHeight: 块长度
 - gap: 砖缝宽度
 - gapMaterial: 砖缝材质
 - rotation: 铺贴旋转
 - offsetU: 铺贴旋转offsetU
 - offsetV: 铺贴旋转offsetV
 - outerPath: 整体铺贴的3d外围轮廓
 - innerPaths: 整体铺贴的3d内部轮廓
 - material: 铺贴材质

#### 方法

 - 各个属性的set、get方法
 - rebuild方法： 根据属性生成每块砖和砖缝的路径

#### 构造函数

传入outerPath和innerPaths，outerPath是一个路径,innerPaths是路径数组


### 直铺模式

继承自基类，属性为直铺的属性，rebuild会生成直铺每块砖和砖缝的路径

### 工字铺模式

继承自基类，属性为工字铺的属性，rebuild会生成工字铺的mesh


## region

### 区域基类

#### 构造函数

传入outerPath和innerPaths，outerPath是一个路径,innerPaths是路径数组

#### 方法

rebuild会生成区域内每一块砖和砖缝的路径

### PresetRegion

预设区域类，继承自基类

#### 构造函数

传入outerPath、innerPaths、pattern，outerPath是一个路径,innerPaths是路径数组，pattern是一个常量，`zhipu`表示直铺，`gongzi`表示工字铺
根据pattern常量创建不同的pattern对象

#### 方法

 - rebuild方法 - 调用pattern对象的rebuild方法，生成路径和线条

## Material对象

在Material中添加regions属性，类型为region对象数组。

## FaceModel对象

增加一个getGraphData，检查material对象的regions属性个数是否大于0，如果大于0，说明是铺贴区域，调用每个region对象的rebuild生成路径和线条，以及对应材质

如果等于0，说明是默认区域，生成面的路径和材质