#!/bin/bash

echo "=== 天猫激励订单数据登记系统启动脚本 ==="
echo ""

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "错误: 未安装Docker"
    echo "请先安装Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# 检查Docker Compose是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "错误: 未安装Docker Compose"
    echo "请先安装Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "正在启动服务..."
echo ""

# 启动服务
docker-compose up -d

echo ""
echo "=== 服务启动完成 ==="
echo ""
echo "前端访问地址: http://localhost"
echo "API服务地址: http://localhost:3001"
echo ""
echo "常用命令:"
echo "  查看日志: docker-compose logs -f"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"
echo ""