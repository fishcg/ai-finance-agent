APP_NAME := finance-bot
PORT := 3000

# 从 .env.local 读取环境变量传入容器
ENV_FILE := .env.local

.PHONY: dev build start docker-build docker-run docker-stop clean

# 本地开发
dev:
	npm run dev

# 本地构建
build:
	npm run build

# 本地启动（需先 build）
start:
	npm run start

# Docker 构建镜像
docker-build:
	docker build -t $(APP_NAME) .

# Docker 运行
docker-run:
	docker run -d --name $(APP_NAME) \
		-p $(PORT):3000 \
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
