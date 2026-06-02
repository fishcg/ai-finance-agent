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
  // 腾讯紧凑格式 yyyyMMddHHmmss
  const compact = time.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (compact) {
    return {
      date: `${compact[1]}-${compact[2]}-${compact[3]}`,
      time: `${compact[4]}:${compact[5]}:${compact[6]}`,
    };
  }
  // 港股/美股形如 "2026/06/02 16:08:50" 或 "2026-06-02 16:08:50"
  const slash = time.match(/^(\d{4})[/\-](\d{2})[/\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (slash) {
    return {
      date: `${slash[1]}-${slash[2]}-${slash[3]}`,
      time: `${slash[4]}:${slash[5]}:${slash[6]}`,
    };
  }
  return { date: time, time: "" };
}

export async function fetchQuote(code: string, market: Market): Promise<Quote> {
  if (market === "fund") {
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

  if (market === "hk") {
    const [q] = await sdk.getHKQuotes([code]);
    if (!q) throw new Error(`港股 ${code} 未返回数据`);
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
      amount: q.amount,
      changePct: q.changePercent,
      date,
      time,
      currency: q.currency,
    };
  }

  if (market === "us") {
    const [q] = await sdk.getUSQuotes([code]);
    if (!q) throw new Error(`美股 ${code} 未返回数据`);
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
      amount: q.amount,
      changePct: q.changePercent,
      date,
      time,
      currency: "USD",
    };
  }

  // sh / sz: getFullQuotes 需要带前缀
  const symbol = `${market}${code}`;
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
    amount: q.amount * 10000, // SDK 的 amount 单位是「万」，统一换算成元
    changePct: q.changePercent,
    date,
    time,
    currency: "CNY",
  };
}
