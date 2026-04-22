APP_NAME := finance-bot
PORT := $(or $(shell grep '^PORT=' .env.local 2>/dev/null | cut -d= -f2),3000)

# 从 .env.local 读取环境变量传入容器
ENV_FILE := .env.local

.PHONY: dev build start ingest docker-build docker-run docker-stop docker-deploy clean

# 本地开发
dev:
	PORT=$(PORT) npm run dev

# 本地构建
build:
	npm run build

# 本地启动（需先 build）
start:
	PORT=$(PORT) npm run start

# 导入文档到向量库
ingest:
	npm run ingest

# Docker 构建镜像
docker-build:
	docker build -t $(APP_NAME) .

# Docker 运行
docker-run:
	docker run -d --name $(APP_NAME) \
		-p $(PORT):$(PORT) \
		-e PORT=$(PORT) \
		--env-file $(ENV_FILE) \
		$(APP_NAME)

# Docker 停止并删除容器
docker-stop:
	docker stop $(APP_NAME) && docker rm $(APP_NAME)

# Docker 重新部署（停止 + 构建 + 运行）
docker-deploy: docker-stop docker-build docker-run

# 清理构建产物
clean:
	rm -rf .next node_modules
