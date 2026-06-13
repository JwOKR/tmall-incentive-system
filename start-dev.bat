@echo off
chcp 65001 >nul

echo ========================================
echo   天猫激励订单数据登记系统 - 本地开发
echo ========================================
echo.

REM 检查Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未安装Node.js
    echo 请先安装Node.js: https://nodejs.org/
    pause
    exit /b 1
)

echo [信息] Node.js版本:
node -v
echo.

REM 安装后端依赖
echo [步骤1] 安装后端依赖...
cd server
call npm install
if %errorlevel% neq 0 (
    echo [错误] 后端依赖安装失败
    pause
    exit /b 1
)

REM 生成Prisma客户端
echo.
echo [步骤2] 生成Prisma客户端...
call npx prisma generate

REM 初始化数据库
echo.
echo [步骤3] 初始化数据库...
call npx prisma db push

REM 插入种子数据
echo.
echo [步骤4] 插入示例数据...
call npx ts-node prisma/seed.ts

cd ..

REM 安装前端依赖
echo.
echo [步骤5] 安装前端依赖...
cd client
call npm install
if %errorlevel% neq 0 (
    echo [错误] 前端依赖安装失败
    pause
    exit /b 1
)

cd ..

echo.
echo ========================================
echo   启动开发服务器
echo ========================================
echo.
echo 后端API: http://localhost:3001
echo 前端页面: http://localhost:5173
echo.
echo 按 Ctrl+C 停止服务
echo ========================================
echo.

REM 启动后端
start "天猫激励-后端" cmd /k "cd server && npm run dev"

REM 等待2秒
timeout /t 2 /nobreak >nul

REM 启动前端
start "天猫激励-前端" cmd /k "cd client && npm run dev"

echo [完成] 服务已启动！
echo 请在浏览器访问 http://localhost:5173
echo.
pause