import { StockSDK } from "stock-sdk";

export type Market = "sh" | "sz" | "hk" | "us" | "fund";

export interface EquityQuote {
  kind: "equity";
  market: Market;
  code: string;
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
  currency?: string;
}

export interface FundNavQuote {
  kind: "fund";
  market: "fund";
  code: string;
  name: string;
  nav: number;
  accNav: number;
  navDate: string;
}

export type Quote = EquityQuote | FundNavQuote;

const sdk = new StockSDK({
  retry: { maxRetries: 2, baseDelay: 500 },
});

function formatDateTime(time: string, timestamp: number): { date: string; time: string } {
  if (timestamp && Number.isFinite(timestamp)) {
    const d = new Date(timestamp);
    return {
      date: d.toISOString().slice(0, 10),
      time: d.toISOString().slice(11, 19),
    };
  }
  if (!time) return { date: "", time: "" };
  const compact = time.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (compact) {
    return {
      date: `${compact[1]}-${compact[2]}-${compact[3]}`,
      time: `${compact[4]}:${compact[5]}:${compact[6]}`,
    };
  }
  const slash = time.match(/^(\d{4})[/\-](\d{2})[/\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (slash) {
    return {
      date: `${slash[1]}-${slash[2]}-${slash[3]}`,
      time: `${slash[4]}:${slash[5]}:${slash[6]}`,
    };
  }
  return { date: time, time: "" };
}

// A 股代码 → 市场推断。覆盖常见前缀，命中不了返回 null。
function inferAShareMarket(rawCode: string): "sh" | "sz" | null {
  const c = rawCode.replace(/^(sh|sz)/i, "");
  if (!/^\d{6}$/.test(c)) return null;
  const p2 = c.slice(0, 2);
  // 沪市：60 主板, 68 科创板, 11/13 可转债, 5xx ETF/LOF, 90 沪B
  if (p2 === "60" || p2 === "68" || p2 === "11" || p2 === "13" || p2 === "90") return "sh";
  if (c.startsWith("5")) return "sh";
  // 深市：00 主板, 30 创业板, 12 可转债, 15/16/18 ETF/LOF, 20 深B, 39 深指
  if (
    p2 === "00" ||
    p2 === "30" ||
    p2 === "12" ||
    p2 === "15" ||
    p2 === "16" ||
    p2 === "18" ||
    p2 === "20" ||
    p2 === "39"
  ) {
    return "sz";
  }
  return null;
}

function stripPrefix(code: string): string {
  return code.replace(/^(sh|sz|hk|us)/i, "");
}

async function fetchAShare(rawCode: string, market: "sh" | "sz"): Promise<EquityQuote> {
  const symbol = `${market}${stripPrefix(rawCode)}`;
  const [q] = await sdk.getFullQuotes([symbol]);
  if (!q) throw new Error(`${symbol} 未返回数据`);
  const { date, time } = formatDateTime(q.time, q.timestamp);
  return {
    kind: "equity",
    market,
    code: q.code,
    name: q.name,
    current: q.price,
    open: q.open,
    prevClose: q.prevClose,
    high: q.high,
    low: q.low,
    volume: q.volume,
    amount: q.amount * 10000,
    changePct: q.changePercent,
    date,
    time,
    currency: "CNY",
  };
}

async function fetchHK(code: string): Promise<EquityQuote> {
  const [q] = await sdk.getHKQuotes([stripPrefix(code)]);
  if (!q) throw new Error(`港股 ${code} 未返回数据`);
  const { date, time } = formatDateTime(q.time, q.timestamp);
  return {
    kind: "equity",
    market: "hk",
    code: q.code,
    name: q.name,
    current: q.price,
    open: q.open,
    prevClose: q.prevClose,
    high: q.high,
    low: q.low,
    volume: q.volume,
    amount: q.amount,
    changePct: q.changePercent,
    date,
    time,
    currency: q.currency,
  };
}

async function fetchUS(code: string): Promise<EquityQuote> {
  const [q] = await sdk.getUSQuotes([stripPrefix(code)]);
  if (!q) throw new Error(`美股 ${code} 未返回数据`);
  const { date, time } = formatDateTime(q.time, q.timestamp);
  return {
    kind: "equity",
    market: "us",
    code: q.code,
    name: q.name,
    current: q.price,
    open: q.open,
    prevClose: q.prevClose,
    high: q.high,
    low: q.low,
    volume: q.volume,
    amount: q.amount,
    changePct: q.changePercent,
    date,
    time,
    currency: "USD",
  };
}

async function fetchFund(code: string): Promise<FundNavQuote> {
  const [q] = await sdk.getFundQuotes([code]);
  if (!q) throw new Error(`基金 ${code} 未返回数据`);
  return {
    kind: "fund",
    market: "fund",
    code: q.code,
    name: q.name,
    nav: q.nav,
    accNav: q.accNav,
    navDate: q.navDate,
  };
}

async function fetchBySearch(rawCode: string): Promise<Quote> {
  const cleaned = stripPrefix(rawCode);
  const results = await sdk.search(cleaned);
  if (!results.length) throw new Error(`找不到代码 ${rawCode}`);
  // 优先精确匹配代码末尾相同的结果
  const hit =
    results.find((r) => stripPrefix(r.code) === cleaned) || results[0];
  const m = hit.market.toLowerCase();
  if (m === "sh" || m === "sz") return fetchAShare(cleaned, m);
  if (m === "hk") return fetchHK(stripPrefix(hit.code));
  if (m === "us") return fetchUS(stripPrefix(hit.code));
  throw new Error(`代码 ${rawCode} 命中未知市场 ${hit.market}`);
}

export interface SearchHit {
  code: string;
  name: string;
  market: string;
  type: string;
  category?: string;
}

export async function searchSymbols(keyword: string, limit = 20): Promise<SearchHit[]> {
  const results = await sdk.search(keyword);
  return results.slice(0, limit).map((r) => ({
    code: r.code,
    name: r.name,
    market: r.market,
    type: r.type,
    category: r.category,
  }));
}

export async function fetchQuote(code: string, market?: Market): Promise<Quote> {
  if (market === "fund") return fetchFund(stripPrefix(code));
  if (market === "hk") return fetchHK(code);
  if (market === "us") return fetchUS(code);

  // A 股或未指定：先按代码前缀推断
  const inferred = inferAShareMarket(code);
  const target: "sh" | "sz" | null = inferred || (market === "sh" || market === "sz" ? market : null);

  if (target) {
    try {
      return await fetchAShare(code, target);
    } catch {
      // 规则推断错了或接口没数据，落到 search
    }
  }

  return fetchBySearch(code);
}
