#!/bin/bash

echo "=== 天猫激励订单数据登记系统 - 本地开发模式 ==="
echo ""

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "错误: 未安装Node.js"
    echo "请先安装Node.js: https://nodejs.org/"
    exit 1
fi

echo "Node.js版本: $(node -v)"
echo "npm版本: $(npm -v)"
echo ""

# 安装后端依赖
echo "正在安装后端依赖..."
cd server
npm install

# 生成Prisma客户端
echo "正在生成Prisma客户端..."
npx prisma generate

# 推送数据库
echo "正在初始化数据库..."
npx prisma db push

# 启动后端
echo "正在启动后端服务..."
npm run dev &
BACKEND_PID=$!

cd ..

# 安装前端依赖
echo "正在安装前端依赖..."
cd client
npm install

# 启动前端
echo "正在启动前端服务..."
npm run dev &
FRONTEND_PID=$!

cd ..

echo ""
echo "=== 开发服务启动完成 ==="
echo ""
echo "前端访问地址: http://localhost:5173"
echo "API服务地址: http://localhost:3001"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo ""

# 捕获退出信号
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

# 等待
wait