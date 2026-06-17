import type { IntradayData } from "./intradayApi";
import type { MarketQuote } from "./quoteApi";

export const MARKET_DATA_MESSAGE_TYPE = "STOCKWATCH_FETCH_MARKET_DATA";

export type MarketDataRequest =
  | {
      type: typeof MARKET_DATA_MESSAGE_TYPE;
      action: "intraday";
      secid: string;
    }
  | {
      type: typeof MARKET_DATA_MESSAGE_TYPE;
      action: "quotes";
      secids: string[];
    };

export type MarketDataResponse<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

export type MarketDataResponsePayload =
  | IntradayData
  | MarketQuote[];

export const isMarketDataRequest = (
  message: unknown,
): message is MarketDataRequest => {
  if (!message || typeof message !== "object") return false;

  const candidate = message as Partial<MarketDataRequest>;
  if (candidate.type !== MARKET_DATA_MESSAGE_TYPE) return false;

  if (candidate.action === "intraday") {
    return typeof candidate.secid === "string" && candidate.secid.length > 0;
  }

  if (candidate.action === "quotes") {
    return (
      Array.isArray(candidate.secids) &&
      candidate.secids.every((secid) => typeof secid === "string")
    );
  }

  return false;
};
