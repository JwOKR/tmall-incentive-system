#!/bin/bash
# 快速验证构建脚本

echo "🔍 开始验证构建..."
echo ""

# 验证前端
echo "📦 验证前端..."
cd client
if npm run build > /dev/null 2>&1; then
  echo "✅ 前端构建成功"
else
  echo "❌ 前端构建失败"
  npm run build
  exit 1
fi

if npx tsc --noEmit > /dev/null 2>&1; then
  echo "✅ TypeScript检查通过"
else
  echo "❌ TypeScript检查失败"
  npx tsc --noEmit
  exit 1
fi
cd ..

# 验证后端
echo ""
echo "📦 验证后端..."
cd server
if npx prisma generate > /dev/null 2>&1; then
  echo "✅ Prisma生成成功"
else
  echo "❌ Prisma生成失败"
  exit 1
fi

if npm run build > /dev/null 2>&1; then
  echo "✅ 后端构建成功"
else
  echo "❌ 后端构建失败"
  npm run build
  exit 1
fi

if npx tsc --noEmit > /dev/null 2>&1; then
  echo "✅ TypeScript检查通过"
else
  echo "❌ TypeScript检查失败"
  npx tsc --noEmit
  exit 1
fi
cd ..

echo ""
echo "🎉 所有验证通过！可以安全推送。"
