#!/bin/bash
# Build & deploy frontend with version info
cd "$(dirname "$0")"

export VITE_GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
export VITE_BUILD_TIME=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

echo "Building with version: $VITE_GIT_HASH @ $VITE_BUILD_TIME"

docker compose up -d --build "$@"
