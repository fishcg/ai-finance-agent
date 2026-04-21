---
name: bilibili-investment-digest
description: 获取指定 B 站 UP 主最近 7 天视频的 AI 总结/字幕，结合 A 股美股资讯，综合分析投资信息。当用户提到"投资总结"、"投资摘要"、"股市分析"、"CLS同学"、"投资周报" 等关键词时启动。
---

# B 站 UP 主投资信息综合分析

## 功能
1. 获取指定 UP 主（默认 mid=1575688490，CLS同学）最近 7 天发布的所有视频
2. 逐个获取每个视频的 AI 总结或 AI 字幕
3. 使用 WebSearch 获取最近 A 股和美股资讯
4. 综合分析并输出投资信息摘要，单独列出 UP 主的投资建议

## 前置条件
- 需要有效的 `SESSDATA` cookie
- 凭据存放在 `~/.config/bilibili-cookie`，格式为：
  ```
  BILIBILI_SESSDATA='你的SESSDATA值'
  ```
- 只需要 SESSDATA 即可，buvid3/buvid4 等字段会通过 B 站 API 自动获取（见下方说明）

## 重要注意事项

### Shell 转义问题
- **禁止**在 shell 中用 `curl | python3 -c '...'` 内联 python，shell 会对 `!=` 等字符做转义导致语法错误
- **必须**使用 `python3 /dev/stdin << 'PYEOF'` heredoc 方式，或写入临时 .py 文件再执行
- **禁止**用 `source` 后在 python heredoc 中通过 `os.environ` 读取变量（子进程拿不到）
- **必须**在 python 代码内部直接读取配置文件

### 请求头要求
- 所有 HTTP 请求**必须**携带完整 User-Agent，否则部分接口返回空响应
- 推荐 UA：`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`

### 空间接口风控（关键经验）
- `x/space/wbi/arc/search` 接口风控严格，使用 python `requests` 库直接请求会返回 **412 被拦截**
- **必须**使用 `subprocess.run(["curl", ...])` 调用 curl 来请求该接口
- **必须**携带 buvid3 + buvid4 + SESSDATA 组合的 cookie，以及 `Referer: https://space.bilibili.com/{mid}/video` 头
- buvid3/buvid4 **不需要用户提供**，可通过 B 站 `finger/spi` 接口自动获取：
  ```
  GET https://api.bilibili.com/x/frontend/finger/spi
  响应: {"code":0,"data":{"b_3":"xxx","b_4":"xxx"}}
  ```
- 自动构造 cookie 的流程：
  1. 调用 `finger/spi` 获取 buvid3 (b_3) 和 buvid4 (b_4)
  2. 拼接 cookie: `buvid3={b_3}; buvid4={b_4}; SESSDATA={sessdata}`
  3. 用这个 cookie 请求空间接口即可通过风控
- 其他接口（nav、view、conclusion/get、player/v2、字幕下载）用 curl + 同样的 cookie 也可以正常工作

### Python 中使用 curl 的模式
在 python heredoc 中统一使用以下 helper 函数发起请求：

```python
import subprocess, json

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

## 执行逻辑

### 第一步：检查凭据

```bash
test -f ~/.config/bilibili-cookie && echo "EXISTS" || echo "NOT_FOUND"
```

不存在则用 AskUserQuestion 询问 SESSDATA 并创建配置文件。

### 第二步：获取 UP 主最近 7 天的视频列表

将获取 wbi keys、签名、请求视频列表合并在一个 python heredoc 脚本中。**使用 curl 而非 requests 发起请求**：

```bash
python3 /dev/stdin << 'PYEOF'
import hashlib, time, urllib.parse, json, functools, re, subprocess

# === 读取凭据 ===
sessdata = ""
with open("/Users/fish/.config/bilibili-cookie") as f:
    for line in f:
        line = line.strip()
        m = re.match(r"BILIBILI_SESSDATA=['\"]?([^'\"\\n]+)", line)
        if m:
            sessdata = m.group(1)

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

def curl_get(url, cookie=None, referer=None):
    cmd = ["curl", "-s", "-H", "User-Agent: " + UA]
    if referer:
        cmd += ["-H", "Referer: " + referer]
    if cookie:
        cmd += ["-b", cookie]
    cmd.append(url)
    r = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(r.stdout)

# === 自动获取 buvid3/buvid4（解决空间接口 412 风控）===
spi = curl_get("https://api.bilibili.com/x/frontend/finger/spi")
buvid3 = spi["data"]["b_3"]
buvid4 = spi["data"]["b_4"]
cookie = "buvid3=%s; buvid4=%s; SESSDATA=%s" % (buvid3, buvid4, sessdata)

# === Wbi 签名 ===
MIXIN_KEY_ENC_TAB = [
    46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,
    33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,
    61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,
    36,20,34,44,52
]

def get_mixin_key(raw):
    return functools.reduce(lambda s, i: s + raw[i], MIXIN_KEY_ENC_TAB, "")[:32]

nav = curl_get("https://api.bilibili.com/x/web-interface/nav", cookie)
wbi = nav["data"]["wbi_img"]
img_key = wbi["img_url"].rsplit("/",1)[1].split(".")[0]
sub_key = wbi["sub_url"].rsplit("/",1)[1].split(".")[0]

def sign(params):
    mk = get_mixin_key(img_key + sub_key)
    params["wts"] = int(time.time())
    params = dict(sorted(params.items()))
    query = urllib.parse.urlencode(params)
    params["w_rid"] = hashlib.md5((query + mk).encode()).hexdigest()
    return params

TARGET_MID = 1575688490  # 可替换为用户指定的 mid
SEVEN_DAYS_AGO = int(time.time()) - 7 * 86400

# === 获取视频列表（curl + 自动 cookie + Referer）===
params = sign({"mid": TARGET_MID, "order": "pubdate", "pn": 1, "ps": 30})
data = curl_get(
    "https://api.bilibili.com/x/space/wbi/arc/search?" + urllib.parse.urlencode(params),
    cookie,
    "https://space.bilibili.com/%d/video" % TARGET_MID
)

if data["code"] != 0:
    print("ERROR:", data["message"])
else:
    vlist = data["data"]["list"]["vlist"]
    recent = [v for v in vlist if v["created"] >= SEVEN_DAYS_AGO]
    if not recent:
        print("最近 7 天没有新视频")
    else:
        print("最近 7 天共 %d 个视频：" % len(recent))
        for v in recent:
            ts = time.strftime("%Y-%m-%d %H:%M", time.localtime(v["created"]))
            print("bvid=%s | title=%s | date=%s | duration=%s" % (v["bvid"], v["title"], ts, v["length"]))

    with open("/tmp/bili_recent_videos.json", "w") as f:
        json.dump(recent, f, ensure_ascii=False)
PYEOF
```

### 第三步：获取每个视频的 cid + AI 总结 + 字幕

合并为一个脚本，减少重复的 wbi keys 获取。对每个视频：
1. 查询视频详情获取 cid
2. 尝试 AI 总结接口
3. Fallback 到播放器字幕接口

```bash
python3 /dev/stdin << 'PYEOF'
import hashlib, time, urllib.parse, json, functools, re, subprocess

# === 读取凭据 ===
sessdata = ""
with open("/Users/fish/.config/bilibili-cookie") as f:
    for line in f:
        line = line.strip()
        m = re.match(r"BILIBILI_SESSDATA=['\"]?([^'\"\\n]+)", line)
        if m:
            sessdata = m.group(1)

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

def curl_get(url, cookie=None, referer=None):
    cmd = ["curl", "-s", "-H", "User-Agent: " + UA]
    if referer:
        cmd += ["-H", "Referer: " + referer]
    if cookie:
        cmd += ["-b", cookie]
    cmd.append(url)
    r = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(r.stdout)

# === 自动获取 buvid3/buvid4 ===
spi = curl_get("https://api.bilibili.com/x/frontend/finger/spi")
buvid3 = spi["data"]["b_3"]
buvid4 = spi["data"]["b_4"]
cookie = "buvid3=%s; buvid4=%s; SESSDATA=%s" % (buvid3, buvid4, sessdata)

MIXIN_KEY_ENC_TAB = [
    46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,
    33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,
    61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,
    36,20,34,44,52
]

def get_mixin_key(raw):
    return functools.reduce(lambda s, i: s + raw[i], MIXIN_KEY_ENC_TAB, "")[:32]

nav = curl_get("https://api.bilibili.com/x/web-interface/nav", cookie)
wbi = nav["data"]["wbi_img"]
img_key = wbi["img_url"].rsplit("/",1)[1].split(".")[0]
sub_key = wbi["sub_url"].rsplit("/",1)[1].split(".")[0]

def sign(params):
    mk = get_mixin_key(img_key + sub_key)
    params["wts"] = int(time.time())
    params = dict(sorted(params.items()))
    query = urllib.parse.urlencode(params)
    params["w_rid"] = hashlib.md5((query + mk).encode()).hexdigest()
    return params

with open("/tmp/bili_recent_videos.json") as f:
    videos = json.load(f)

all_results = []
for v in videos:
    bvid = v["bvid"]
    title = v["title"]
    print("处理: %s - %s" % (bvid, title))

    # 获取 cid
    info = curl_get("https://api.bilibili.com/x/web-interface/view?bvid=" + bvid, cookie)
    cid = info["data"]["cid"]
    up_mid = info["data"]["owner"]["mid"]

    result = {"bvid": bvid, "title": title, "created": v["created"]}

    # 尝试 AI 总结
    params = sign({"bvid": bvid, "cid": cid, "up_mid": up_mid})
    summary_data = curl_get(
        "https://api.bilibili.com/x/web-interface/view/conclusion/get?" + urllib.parse.urlencode(params),
        cookie
    )
    got_summary = False
    if summary_data.get("code") == 0 and summary_data["data"].get("code") == 0:
        mr = summary_data["data"]["model_result"]
        result["ai_summary"] = mr.get("summary", "")
        result["outline"] = mr.get("outline", [])
        got_summary = True
        print("  -> AI 总结获取成功")

    # 始终尝试获取播放器字幕（即使有 AI 总结也获取，字幕内容更完整）
    player = curl_get(
        "https://api.bilibili.com/x/player/wbi/v2?bvid=%s&cid=%d" % (bvid, cid),
        cookie
    )
    subs = player.get("data", {}).get("subtitle", {}).get("subtitles", [])
    if subs:
        target = None
        for s in subs:
            if "zh" in s["lan"]:
                target = s
                break
        if not target:
            target = subs[0]
        sub_url = target["subtitle_url"]
        if sub_url.startswith("//"):
            sub_url = "https:" + sub_url
        sub_data = curl_get(sub_url)
        body = sub_data.get("body", [])
        result["subtitle_text"] = " ".join(item["content"] for item in body)
        result["subtitle_count"] = len(body)
        print("  -> AI 字幕获取成功 (%d 条)" % len(body))
    else:
        result["subtitle_text"] = ""
        if not got_summary:
            print("  -> 无可用内容")

    all_results.append(result)

with open("/tmp/bili_investment_content.json", "w") as f:
    json.dump(all_results, f, ensure_ascii=False, indent=2)

print("\n=== 完成，共处理 %d 个视频 ===" % len(all_results))
PYEOF
```

### 第四步：获取 A 股、美股和大宗商品资讯

使用 WebSearch 工具**并行**搜索以下内容（替换年份为当前年份）：

1. `{年}年{月}月 A股 本周行情 走势分析`
2. `{年}年{月}月 美股 本周行情 走势分析`
3. `{年}年{月}月 黄金 原油 大宗商品 行情走势`

根据 UP 主视频中提到的具体资产，**追加搜索**相关标的：
- 如提到日经 → 搜索 `日经指数 {月}月 走势`
- 如提到 TLT/美债 → 搜索 `TLT 美国长期国债 {月}月 利率 走势`
- 如提到原油/美伊 → 搜索 `美伊和谈 原油价格 {月}月`

WebFetch 可能因网络限制失败，不要依赖它，以 WebSearch 摘要为主。

### 第五步：综合分析并输出

读取 `/tmp/bili_investment_content.json` 中的视频内容，结合第四步的市场资讯，输出以下结构化报告：

#### 输出格式

```
## UP 主近期视频概览
- 列出每个视频标题、发布日期、内容摘要

## UP 主投资观点与建议（重点）
- 分两部分：
  1. 宏观判断 / 研报观点（UP 主转述的研报内容）
  2. UP 主个人操作记录（用表格展示：资产类别 | 操作 | 方向 | 详情）
- 按资产类别分类（A股、美股、期货、债券、黄金、日经等）
- 标注看多/看空方向

## 近期市场资讯
### A 股
### 美股
### 大宗商品（原油、黄金等）
### 其他（债券、日经等，根据 UP 主提到的标的补充）

## 综合分析
- 将 UP 主观点与实际市场走势对照
- 指出一致/分歧的部分
- 风险提示：以上内容不构成投资建议

Sources:
- 列出所有 WebSearch 结果中引用的链接
```

### 错误处理
- 凭据缺失：提示配置 SESSDATA
- 视频列表为空：提示该 UP 主最近 7 天没有发布视频
- AI 总结和字幕都获取失败：跳过该视频，在报告中标注
- -412 请求被拦截：检查是否正确调用了 `finger/spi` 获取 buvid，以及是否使用了 curl + Referer
- nav 接口返回空响应：缺少 User-Agent 头
- finger/spi 接口失败：极少见，可重试一次；如仍失败则提示用户手动提供完整 cookie
- WebSearch 不可用/结果不足：跳过市场资讯部分，仅基于 UP 主视频内容输出分析，在报告中标注"市场资讯暂不可用，仅基于 UP 主视频内容分析"
