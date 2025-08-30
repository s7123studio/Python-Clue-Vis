# Python-Clue-Vis

PCV，Python+Flask的线索可视化管理平台，轻量级，易部署

## 项目简介

Python-Clue-Vis是一个基于Python和Flask开发的线索可视化管理平台，旨在帮助用户以可视化的方式管理和分析线索之间的关系。该平台提供了直观的界面，可以可视化创建、编辑、连接线索，并通过分析模式发现线索之间的隐藏关系。
![Python-Clue-Vis](https://store.s7123.xyz/wp-content/uploads/2025/08/20250830224325545-f7aa39a4fabc4d79cfaf4dfc36cf01d2.webp)
## 功能特性

- **线索管理**：创建、编辑、删除线索，支持添加标题、内容、图片和时间戳
- **线索连接**：在线索之间建立连接关系，添加连接注释说明关联原因
- **可视化界面**：拖拽式线索板，可自由排列和移动线索
- **分析模式**：提供高亮关键节点、识别孤立节点等分析功能
- **搜索功能**：快速搜索和定位线索
- **数据导入/导出**：支持将线索和连接数据导出为JSON文件，或从JSON文件导入数据
- **用户认证**：基于Flask-Login的用户认证系统，保护数据安全
- **响应式设计**：适配不同设备屏幕大小

## 技术栈

- **后端**：Python、Flask、SQLAlchemy
- **前端**：HTML、CSS、JavaScript
- **数据库**：SQLite（可配置为其他数据库）
- **前端库**：Panzoom（缩放和拖动）、LeaderLine（连接线）、Interact.js（拖拽交互）

## 安装步骤

### 1. 环境要求

- Python 3.7+
- pip（Python包管理器）

### 2. 克隆项目

```bash
git clone https://github.com/s7123studio/Python-Clue-Vis.git
cd Python-Clue-Vis
```

### 3. 创建虚拟环境（可选）*不创建虚拟环境请跳转第4步

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/MacOS
python3 -m venv venv
source venv/bin/activate
```

### 4. 安装依赖

```bash
pip install -r requirements.txt
```

### 5. 初始化数据库

```bash
# 运行应用会自动创建数据库和默认管理员用户
python app.py
```

### 6. 启动应用

```bash
python app.py
```

应用将在 http://127.0.0.1:5000/ 上运行。

### 7. 登录系统

使用默认管理员账户登录：
- 用户名：admin
- 密码：admin

## 使用说明

### 基本操作

1. **创建线索**：在线索板上双击空白处，填写线索信息并保存
2. **编辑线索**：右键点击线索卡片，选择"编辑线索"
3. **删除线索**：右键点击线索卡片，选择"删除线索"
4. **连接线索**：右键点击线索卡片，选择"开始连接"，然后点击目标线索
5. **移动线索**：直接拖拽线索卡片到新位置
6. **搜索线索**：使用顶部搜索框输入关键词搜索线索

### 分析模式

1. 点击顶部"分析模式"按钮打开分析菜单
2. 选择分析功能：
   - **高亮关键节点**：突出显示连接数较多的线索
   - **识别孤立节点**：高亮显示没有连接的线索
   - **清除分析**：移除所有分析效果

### 数据导入/导出

1. **导出数据**：右键点击线索板空白处，选择"导出数据"
2. **导入数据**：右键点击线索板空白处，选择"导入数据"，选择JSON文件

## 项目结构

```
Python-Clue-Vis/
├── app.py              # Flask应用主文件
├── models.py           # 数据库模型定义
├── requirements.txt    # 项目依赖
├── README.md           # 项目说明文档
├── static/             # 静态文件目录
│   ├── css/            # CSS样式文件
│   │   └── style.css   # 主样式文件
│   ├── js/             # JavaScript文件
│   │   └── main.js     # 主JavaScript文件
│   └── uploads/        # 上传文件存储目录
└── templates/          # HTML模板目录
    ├── index.html      # 主页模板
    └── login.html      # 登录页模板
```

## 数据库模型

### User（用户）
- id：用户ID
- username：用户名
- password：密码（加密存储）

### Clue（线索）
- id：线索ID
- title：线索标题
- content：线索内容
- image：线索图片路径
- pos_x：X坐标位置
- pos_y：Y坐标位置
- clue_id：线索唯一标识
- timestamp：时间戳

### Connection（连接）
- id：连接ID
- source_id：源线索ID
- target_id：目标线索ID
- comment：连接注释

## 贡献指南

1. Fork本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建Pull Request

## 许可证

本项目采用Apache许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 联系方式

如有问题或建议，请通过以下方式联系：
- 项目地址：https://github.com/s7123studio/Python-Clue-Vis
- 邮箱：[s7123@foxmail.com]
