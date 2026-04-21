---
name: bilibili-video-ai
description: 获取 Bilibili 视频的 AI 总结和字幕信息。当用户提到"视频总结"、"视频摘要"、"获取字幕"、"视频字幕"、"AI字幕"、"bilibili字幕" 等关键词时启动。
---

# Bilibili 视频 AI 总结 & 字幕获取

## 功能
根据用户提供的 BV 号或 AV 号，获取 Bilibili 视频的 AI 总结（摘要 + 分段提纲）和 AI 字幕内容。

## 前置条件
- 需要有效的 `SESSDATA` cookie（AI 总结接口需要登录）
- 凭据存放在 `~/.config/bilibili-cookie`，格式为：
  ```
  BILIBILI_SESSDATA='你的SESSDATA值'
  ```

## 重要注意事项

### Shell 转义问题
- **禁止**在 shell 中用 `curl | python3 -c '...'` 的方式内联 python 代码，shell 会对引号和 `!=` 等字符做转义导致语法错误
- **必须**使用 `python3 /dev/stdin << 'PYEOF'` heredoc 方式执行 python 代码，或先写入临时 .py 文件再执行
- **禁止**用 `source ~/.config/bilibili-cookie` 后在 python heredoc 中通过 `os.environ` 读取变量（heredoc 启动的是子进程，拿不到 shell 变量）
- **必须**在 python 代码内部直接读取配置文件

### 请求头要求
- 所有 HTTP 请求**必须**携带完整 User-Agent，否则部分接口（如 nav）会返回空响应
- 推荐 UA：`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`

### 推荐使用 curl 而非 requests
- 部分 B 站接口（如空间视频列表）对 python requests 库有风控，返回 412
- 推荐在 python heredoc 中统一使用 `subprocess.run(["curl", ...])` 发起请求，更稳定
- 使用以下 helper 函数：
  ```python
  def curl_get(url, cookie=None, referer=None):
      cmd = ["curl", "-s", "-H", "User-Agent: " + UA]
      if referer:
          cmd += ["-H", "Referer: " + referer]
      if cookie:
          cmd += ["-b", cookie]
      cmd.append(url)
      r = subprocess.run(cmd, capture_output=True, text=True)
      return json.loads(r.stdout)
  ```

### 自动获取 buvid（解决风控 412）
- 部分接口（尤其是空间接口）需要 buvid3/buvid4 cookie 才能通过风控
- **不需要用户手动提供**，可通过 `finger/spi` 接口自动获取：
  ```
  GET https://api.bilibili.com/x/frontend/finger/spi
  响应: {"code":0,"data":{"b_3":"buvid3值","b_4":"buvid4值"}}
  ```
- 在脚本开头自动获取并拼接 cookie：
  ```python
  spi = curl_get("https://api.bilibili.com/x/frontend/finger/spi")
  buvid3 = spi["data"]["b_3"]
  buvid4 = spi["data"]["b_4"]
  cookie = "buvid3=%s; buvid4=%s; SESSDATA=%s" % (buvid3, buvid4, sessdata)
  ```

## 执行逻辑

### 第一步：检查凭据

```bash
test -f ~/.config/bilibili-cookie && echo "EXISTS" || echo "NOT_FOUND"
```

- 如果文件存在，继续下一步。
- 如果不存在，使用 AskUserQuestion 询问 SESSDATA，然后创建配置文件：
  ```bash
  cat > ~/.config/bilibili-cookie << 'EOF'
  BILIBILI_SESSDATA='用户提供的值'
  EOF
  chmod 600 ~/.config/bilibili-cookie
  ```
- 注意：用户可能会提供完整的 cookie 字符串，需要从中提取 `SESSDATA=xxx` 部分的值

### 第二步：解析用户输入

从用户消息中提取视频标识，支持以下格式：
- BV 号：如 `BV1L94y1H7CV`
- AV 号：如 `av170001`
- 完整链接：如 `https://www.bilibili.com/video/BV1L94y1H7CV`

### 第三步：获取视频信息 + cid

使用 Bash 工具执行，先 curl 保存到临时文件，再用 python 解析：

```bash
source ~/.config/bilibili-cookie && curl -s \
  "https://api.bilibili.com/x/web-interface/view?bvid=$BVID" \
  -b "SESSDATA=$BILIBILI_SESSDATA" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
  -o /tmp/bili_video_info.json
```

然后用 heredoc 解析：

```bash
python3 /dev/stdin << 'PYEOF'
import json
with open("/tmp/bili_video_info.json") as f:
    d = json.load(f)
if d["code"] != 0:
    print("ERROR:", d["message"])
else:
    v = d["data"]
    print("title=" + v["title"])
    print("cid=" + str(v["cid"]))
    print("up_mid=" + str(v["owner"]["mid"]))
    print("duration=" + str(v["duration"]))
    print("up_name=" + v["owner"]["name"])
    if len(v.get("pages", [])) > 1:
        for p in v["pages"]:
            print("page=" + str(p["page"]) + "|cid=" + str(p["cid"]) + "|title=" + p["part"])
PYEOF
```

如果视频有多个分P，使用 AskUserQuestion 让用户选择，或默认使用第一P。

### 第四步：获取 AI 总结（含 Wbi 签名）

将获取 wbi keys、签名、请求 AI 总结合并在一个 python 脚本中执行。**必须在 python 内部读取配置文件**：

```bash
python3 /dev/stdin << 'PYEOF'
import hashlib, time, urllib.parse, requests, json, functools, re

# === 读取 SESSDATA ===
sessdata = ""
with open("/Users/fish/.config/bilibili-cookie") as f:
    for line in f:
        m = re.match(r"BILIBILI_SESSDATA=['\"]?([^'\"\\n]+)", line.strip())
        if m:
            sessdata = m.group(1)
            break

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
HEADERS = {"User-Agent": UA}

# === Wbi 签名 ===
MIXIN_KEY_ENC_TAB = [
    46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,
    33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,
    61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,
    36,20,34,44,52
]

def get_mixin_key(raw):
    return functools.reduce(lambda s, i: s + raw[i], MIXIN_KEY_ENC_TAB, "")[:32]

# 获取 wbi keys
r = requests.get("https://api.bilibili.com/x/web-interface/nav",
    cookies={"SESSDATA": sessdata}, headers=HEADERS)
wbi = r.json()["data"]["wbi_img"]
img_key = wbi["img_url"].rsplit("/",1)[1].split(".")[0]
sub_key = wbi["sub_url"].rsplit("/",1)[1].split(".")[0]

# 签名
bvid = "$BVID"       # 替换为实际值
cid = $CID           # 替换为实际值
up_mid = $UP_MID     # 替换为实际值

params = {"bvid": bvid, "cid": cid, "up_mid": up_mid}
mk = get_mixin_key(img_key + sub_key)
params["wts"] = int(time.time())
params = dict(sorted(params.items()))
query = urllib.parse.urlencode(params)
params["w_rid"] = hashlib.md5((query + mk).encode()).hexdigest()

# === 请求 AI 总结 ===
r = requests.get("https://api.bilibili.com/x/web-interface/view/conclusion/get",
    params=params, cookies={"SESSDATA": sessdata}, headers=HEADERS)
data = r.json()

if data["code"] != 0:
    print("请求失败:", data["message"])
else:
    d = data["data"]
    if d["code"] == 1:
        stid = d.get("stid", "")
        if stid == "0":
            print("STATUS:NO_SUMMARY_QUEUED")
        else:
            print("STATUS:NO_SUMMARY_NO_VOICE")
    elif d["code"] == -1:
        print("STATUS:NOT_SUPPORTED")
    else:
        mr = d["model_result"]
        print("=== AI 摘要 ===")
        print(mr.get("summary", ""))
        print()
        if mr.get("outline"):
            print("=== 分段提纲 ===")
            for seg in mr["outline"]:
                ts = seg["timestamp"]
                m, s = divmod(ts, 60)
                print("\n[%02d:%02d] %s" % (m, s, seg["title"]))
                for pt in seg.get("part_outline", []):
                    pts = pt["timestamp"]
                    pm, ps = divmod(pts, 60)
                    print("  [%02d:%02d] %s" % (pm, ps, pt["content"]))
        if mr.get("subtitle"):
            print("\n=== AI 字幕（总结接口） ===")
            count = 0
            for sub_group in mr["subtitle"]:
                for item in sub_group.get("part_subtitle", []):
                    count += 1
                    st = item["start_timestamp"]
                    et = item["end_timestamp"]
                    sm, ss = divmod(int(st), 60)
                    em, es = divmod(int(et), 60)
                    print("[%02d:%02d-%02d:%02d] %s" % (sm, ss, em, es, item["content"]))
            print("\n共 %d 条字幕" % count)
PYEOF
```

### 第五步：Fallback - 获取播放器接口的 AI 字幕

如果第四步没有拿到 AI 总结（STATUS:NO_SUMMARY_QUEUED / NO_VOICE / NOT_SUPPORTED），则从播放器接口获取 AI 字幕作为替代：

```bash
python3 /dev/stdin << 'PYEOF'
import requests, json, re

sessdata = ""
with open("/Users/fish/.config/bilibili-cookie") as f:
    for line in f:
        m = re.match(r"BILIBILI_SESSDATA=['\"]?([^'\"\\n]+)", line.strip())
        if m:
            sessdata = m.group(1)
            break

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
HEADERS = {"User-Agent": UA}

bvid = "$BVID"
cid = $CID

# 获取字幕列表
r = requests.get("https://api.bilibili.com/x/player/wbi/v2",
    params={"bvid": bvid, "cid": cid},
    cookies={"SESSDATA": sessdata}, headers=HEADERS)
data = r.json()
subs = data.get("data", {}).get("subtitle", {}).get("subtitles", [])

if not subs:
    print("该视频没有任何字幕")
else:
    # 优先中文字幕
    target = None
    for s in subs:
        print("可用字幕: lan=%s name=%s" % (s["lan"], s["lan_doc"]))
        if "zh" in s["lan"] and target is None:
            target = s
    if target is None:
        target = subs[0]

    # 下载字幕内容
    sub_url = target["subtitle_url"]
    if sub_url.startswith("//"):
        sub_url = "https:" + sub_url
    r2 = requests.get(sub_url, headers=HEADERS)
    body = r2.json().get("body", [])
    for item in body:
        st = item["from"]
        et = item["to"]
        sm, ss = divmod(int(st), 60)
        em, es = divmod(int(et), 60)
        print("[%02d:%02d-%02d:%02d] %s" % (sm, ss, em, es, item["content"]))
    print("\n共 %d 条字幕（来源: %s %s）" % (len(body), target["lan"], target["lan_doc"]))
PYEOF
```

### 第六步：输出结果

将获取到的内容整理后输出给用户，格式清晰，包含：
1. 视频标题、UP主、时长等基本信息
2. AI 摘要（如果有）
3. 分段提纲和时间戳（如果有）
4. AI 字幕内容（来自总结接口或播放器接口）
5. 如果 AI 总结暂无，基于字幕内容为用户做一个简要的内容概要

如果用户需要导出，可以将字幕保存为 SRT 格式文件。

### 错误处理
- 外层 code -101：提示未登录，需要更新 SESSDATA
- 外层 code -400：提示请求参数错误，检查 BV 号/AV 号是否正确
- 外层 code -403：提示访问权限不足
- data.code = 1 且 stid="0"：该视频尚未进行 AI 总结（已加入队列），应 fallback 到播放器字幕接口
- data.code = 1 且 stid 为空：该视频未识别到语音，应 fallback 到播放器字幕接口
- data.code = -1：该视频不支持 AI 总结（敏感内容等），应 fallback 到播放器字幕接口
- nav 接口返回空响应：缺少 User-Agent 头，必须补上
