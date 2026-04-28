export interface StockQuote {
  name: string;
  current: number;
  open: number;
  prevClose: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  changePct: number;
  date: string;
  time: string;
  source: string;
}

export interface DataSourceResult {
  success: boolean;
  data?: StockQuote;
  error?: string;
  latency: number;
}

export interface CrossValidationResult {
  consensus: StockQuote;
  sources: DataSourceResult[];
  quality: "high" | "medium" | "low";
  warnings: string[];
}

// 新浪财经
async function fetchFromSina(code: string, market: "sh" | "sz" | "fund"): Promise<DataSourceResult> {
  const start = Date.now();
  try {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);

    const sinaCode = market === "fund" ? `f_${code}` : `${market}${code}`;
    const { stdout } = await execFileAsync("curl", [
      "-s", "-m", "5",
      "-H", "Referer: https://finance.sina.com.cn",
      "-H", "User-Agent: Mozilla/5.0",
      `https://hq.sinajs.cn/list=${sinaCode}`,
    ]);

    // GBK decode
    let text = stdout;
    try {
      const { exec } = await import("child_process");
      text = await new Promise<string>((resolve) => {
        const proc = exec("iconv -f GBK -t UTF-8", (err, out) => resolve(err ? stdout : out));
        proc.stdin?.write(Buffer.from(stdout, "latin1"));
        proc.stdin?.end();
        setTimeout(() => resolve(stdout), 2000);
      });
    } catch {}

    const match = text.match(/"(.+)"/);
    if (!match?.[1]) return { success: false, error: "无数据", latency: Date.now() - start };

    const f = match[1].split(",");
    if (market === "fund") {
      const current = parseFloat(f[1]);
      const prevClose = parseFloat(f[3]);
      return {
        success: true, latency: Date.now() - start,
        data: {
          name: f[0], current, open: current, prevClose, high: current, low: current,
          volume: 0, amount: 0, changePct: ((current - prevClose) / prevClose) * 100,
          date: f[4], time: "15:00:00", source: "sina",
        },
      };
    }

    const current = parseFloat(f[3]);
    const prevClose = parseFloat(f[2]);
    return {
      success: true, latency: Date.now() - start,
      data: {
        name: f[0], current, open: parseFloat(f[1]), prevClose,
        high: parseFloat(f[4]), low: parseFloat(f[5]),
        volume: parseFloat(f[8]), amount: parseFloat(f[9]),
        changePct: ((current - prevClose) / prevClose) * 100,
        date: f[30], time: f[31], source: "sina",
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message, latency: Date.now() - start };
  }
}

// 腾讯财经
async function fetchFromTencent(code: string, market: "sh" | "sz" | "fund"): Promise<DataSourceResult> {
  const start = Date.now();
  if (market === "fund") return { success: false, error: "不支持基金", latency: Date.now() - start };
  try {
    const res = await fetch(`https://qt.gtimg.cn/q=${market}${code}`, {
      headers: { Referer: "https://gu.qq.com", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { success: false, error: `HTTP ${res.status}`, latency: Date.now() - start };

    const text = await res.text();
    const match = text.match(/="(.+)"/);
    if (!match?.[1]) return { success: false, error: "无数据", latency: Date.now() - start };

    const f = match[1].split("~");
    const current = parseFloat(f[3]);
    const prevClose = parseFloat(f[4]);
    const datetime = f[30] || "";
    const date = datetime.length >= 8 ? `${datetime.slice(0,4)}-${datetime.slice(4,6)}-${datetime.slice(6,8)}` : "";
    const time = datetime.length >= 14 ? `${datetime.slice(8,10)}:${datetime.slice(10,12)}:${datetime.slice(12,14)}` : "";

    return {
      success: true, latency: Date.now() - start,
      data: {
        name: f[1], current, open: parseFloat(f[5]), prevClose,
        high: parseFloat(f[33]), low: parseFloat(f[34]),
        volume: parseFloat(f[6]), amount: parseFloat(f[7]) * 10000,
        changePct: prevClose ? ((current - prevClose) / prevClose) * 100 : 0,
        date, time, source: "tencent",
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message, latency: Date.now() - start };
  }
}

// 东方财富
async function fetchFromEastMoney(code: string, market: "sh" | "sz" | "fund"): Promise<DataSourceResult> {
  const start = Date.now();
  try {
    const emMarket = market === "fund" ? "f" : market === "sh" ? "1" : "0";
    const res = await fetch(
      `https://push2.eastmoney.com/api/qt/stock/get?secid=${emMarket}.${code}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60,f169,f170`,
      { headers: { Referer: "https://quote.eastmoney.com", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return { success: false, error: `HTTP ${res.status}`, latency: Date.now() - start };

    const json = await res.json();
    const d = json.data;
    if (!d || !d.f43) return { success: false, error: "无数据", latency: Date.now() - start };

    const now = new Date();
    return {
      success: true, latency: Date.now() - start,
      data: {
        name: d.f58, current: d.f43 / 100, open: d.f46 / 100, prevClose: d.f60 / 100,
        high: d.f44 / 100, low: d.f45 / 100, volume: d.f47, amount: d.f48,
        changePct: d.f170 / 100,
        date: now.toISOString().slice(0, 10), time: now.toTimeString().slice(0, 8),
        source: "eastmoney",
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message, latency: Date.now() - start };
  }
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function crossValidateStock(code: string, market: "sh" | "sz" | "fund"): Promise<CrossValidationResult> {
  const results = await Promise.all([
    fetchFromSina(code, market),
    fetchFromTencent(code, market),
    fetchFromEastMoney(code, market),
  ]);

  const ok = results.filter((r) => r.success && r.data);
  if (ok.length === 0) throw new Error(`所有数据源失败: ${results.map(r => r.error).join("; ")}`);

  const warnings: string[] = [];
  if (ok.length === 1) warnings.push(`仅 ${ok[0].data!.source} 返回数据，无法交叉验证`);

  const prices = ok.map((r) => r.data!.current);
  if (ok.length > 1) {
    const spread = (Math.max(...prices) - Math.min(...prices)) / median(prices) * 100;
    if (spread > 0.5) warnings.push(`数据源价格差异: ${spread.toFixed(2)}%`);
  }

  const consensus: StockQuote = {
    name: ok[0].data!.name,
    current: median(prices),
    open: median(ok.map(r => r.data!.open)),
    prevClose: median(ok.map(r => r.data!.prevClose)),
    high: median(ok.map(r => r.data!.high)),
    low: median(ok.map(r => r.data!.low)),
    volume: median(ok.map(r => r.data!.volume)),
    amount: median(ok.map(r => r.data!.amount)),
    changePct: median(ok.map(r => r.data!.changePct)),
    date: ok[0].data!.date,
    time: ok[0].data!.time,
    source: `consensus(${ok.length}/${results.length})`,
  };

  const quality: "high" | "medium" | "low" =
    ok.length >= 3 && warnings.length === 0 ? "high" :
    ok.length >= 2 && warnings.length <= 1 ? "medium" : "low";

  return { consensus, sources: results, quality, warnings };
}
