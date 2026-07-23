#!/bin/bash
# Build & deploy frontend with version info
cd "$(dirname "$0")"
export VITE_GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
export VITE_BUILD_TIME=$(TZ=Asia/Shanghai date +"%Y-%m-%d %H:%M:%S")
COMMIT_MSG=$(git log -1 --pretty=format:"%s" 2>/dev/null || echo "unknown")
echo "========================================="
echo "Building: $VITE_GIT_HASH @ $VITE_BUILD_TIME"
echo "Latest commit: $COMMIT_MSG"
echo "========================================="
docker compose up -d --build "$@"
