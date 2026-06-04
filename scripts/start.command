#!/usr/bin/env bash
# 一键启动「理财王中王」开发服务，并在浏览器打开
# 双击此文件即可执行（macOS Terminal 默认行为）
set -euo pipefail

# 切到脚本所在仓库根目录（脚本放在 scripts/ 下）
SCRIPT_DIR="$(cd "$(dirname "$(realpath "$0")")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# 从 .env.local 读 PORT，默认 30001（与 package.json 默认对齐）
PORT="$(grep -E '^PORT=' .env.local 2>/dev/null | head -1 | cut -d= -f2 | tr -d '\r' || true)"
PORT="${PORT:-30001}"

echo "==> 项目目录: $ROOT_DIR"
echo "==> 端口: $PORT"

# 1. 杀掉占用该端口的旧进程（如果有）
EXISTING_PID="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$EXISTING_PID" ]]; then
  echo "==> 端口 $PORT 已被进程 $EXISTING_PID 占用，正在停止..."
  kill -TERM $EXISTING_PID 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    sleep 0.5
    if ! lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      break
    fi
  done
  STILL="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$STILL" ]]; then
    echo "==> 进程未优雅退出，强制 kill..."
    kill -KILL $STILL 2>/dev/null || true
    sleep 0.5
  fi
fi

# 2. 校验依赖
if [[ ! -d node_modules ]]; then
  echo "==> 未发现 node_modules，先执行 npm install..."
  npm install
fi

# 3. 后台启动 dev
LOG_DIR="$ROOT_DIR/.logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/dev-$(date +%Y%m%d-%H%M%S).log"
echo "==> 启动 dev 服务，日志: $LOG_FILE"
PORT="$PORT" nohup npm run dev >"$LOG_FILE" 2>&1 &
DEV_PID=$!
echo "==> 进程 PID: $DEV_PID"

# 4. 等端口就绪（最多 60s）
URL="http://localhost:$PORT"
echo "==> 等待 $URL 就绪..."
for i in $(seq 1 120); do
  if curl -sf -o /dev/null --max-time 2 "$URL" 2>/dev/null; then
    echo "==> 服务已就绪"
    open "$URL"
    echo "==> 已在浏览器打开 $URL"
    echo "==> 实时日志: tail -f \"$LOG_FILE\""
    exit 0
  fi
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    echo "!! dev 进程已退出，查看日志:"
    tail -n 50 "$LOG_FILE"
    exit 1
  fi
  sleep 0.5
done

echo "!! 等待超时（60s），最近日志:"
tail -n 50 "$LOG_FILE"
exit 1
