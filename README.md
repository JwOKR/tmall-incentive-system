# 天猫激励订单数据登记系统

一个用于登记和管理天猫激励订单数据的Web应用，支持Docker部署。

## 功能特性

- **数据汇总** - 订单统计、金额汇总、趋势图表
- **接单人管理** - 添加、编辑、删除接单人信息
- **任务管理** - 创建激励任务，分配给接单人
- **订单明细** - 录入和管理激励订单
- **操作日志** - 记录所有系统操作

## 技术栈

### 后端
- Node.js + Express
- TypeScript
- Prisma ORM
- SQLite

### 前端
- React 18
- TypeScript
- Tailwind CSS
- React Query
- React Router

## 快速开始

### Docker部署（推荐）

1. 确保已安装 Docker 和 Docker Compose

2. 克隆项目并进入目录：
```bash
cd tmall-incentive-system
```

3. 启动服务：
```bash
docker-compose up -d
```

4. 访问应用：
- 前端：http://localhost
- API：http://localhost:3001

### 本地开发

#### 后端

```bash
cd server
npm install
npx prisma generate
npx prisma db push
npm run dev
```

#### 前端

```bash
cd client
npm install
npm run dev
```

访问 http://localhost:5173

## 项目结构

```
tmall-incentive-system/
├── server/                 # 后端服务
│   ├── src/               # 源代码
│   │   ├── controllers/   # 控制器
│   │   ├── routes/        # 路由
│   │   └── utils/         # 工具函数
│   ├── prisma/            # 数据库模型
│   └── Dockerfile
├── client/                # 前端应用
│   ├── src/
│   │   ├── components/    # 组件
│   │   ├── pages/         # 页面
│   │   ├── hooks/         # Hooks
│   │   └── lib/           # 工具库
│   └── Dockerfile
├── docker-compose.yml     # Docker编排
└── README.md
```

## API接口

### 数据汇总
- `GET /api/dashboard/stats` - 获取仪表盘统计数据

### 接单人
- `GET /api/takers` - 获取接单人列表
- `GET /api/takers/:id` - 获取接单人详情
- `POST /api/takers` - 创建接单人
- `PUT /api/takers/:id` - 更新接单人
- `DELETE /api/takers/:id` - 删除接单人

### 任务
- `GET /api/tasks` - 获取任务列表
- `GET /api/tasks/:id` - 获取任务详情
- `POST /api/tasks` - 创建任务
- `PUT /api/tasks/:id` - 更新任务
- `DELETE /api/tasks/:id` - 删除任务
- `POST /api/tasks/assign` - 分配任务

### 订单
- `GET /api/orders` - 获取订单列表
- `GET /api/orders/:id` - 获取订单详情
- `POST /api/orders` - 创建订单
- `PUT /api/orders/:id` - 更新订单
- `DELETE /api/orders/:id` - 删除订单

### 日志
- `GET /api/logs` - 获取操作日志

## 环境变量

### 后端
- `PORT` - 服务端口（默认：3001）
- `NODE_ENV` - 运行环境
- `DATABASE_URL` - 数据库连接字符串
- `CORS_ORIGIN` - 允许的跨域来源

## 许可证

MIT