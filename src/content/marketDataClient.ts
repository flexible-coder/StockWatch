import type { IntradayData } from "@/shared/intradayApi";
import {
  MARKET_DATA_MESSAGE_TYPE,
  type MarketDataRequest,
  type MarketDataResponse,
} from "@/shared/marketDataMessages";
import type { MarketQuote } from "@/shared/quoteApi";

const createAbortError = () => new DOMException("Aborted", "AbortError");

const withAbort = <T>(task: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return task;
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      reject(createAbortError());
    };

    signal.addEventListener("abort", handleAbort, { once: true });
    task
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", handleAbort));
  });
};

const sendMarketDataRequest = <T>(
  request: MarketDataRequest,
  signal?: AbortSignal,
): Promise<T> => {
  const task = new Promise<T>((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      reject(new Error("Chrome runtime messaging is unavailable"));
      return;
    }

    chrome.runtime.sendMessage(
      request,
      (response: MarketDataResponse<T> | undefined) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        if (!response) {
          reject(new Error("Empty market data response"));
          return;
        }

        if (!response.ok) {
          reject(new Error(response.error));
          return;
        }

        resolve(response.data);
      },
    );
  });

  return withAbort(task, signal);
};

export const fetchIntradayDataFromBackground = (
  secid: string,
  signal?: AbortSignal,
): Promise<IntradayData> =>
  sendMarketDataRequest<IntradayData>(
    {
      type: MARKET_DATA_MESSAGE_TYPE,
      action: "intraday",
      secid,
    },
    signal,
  );

export const fetchMarketQuotesFromBackground = (
  secids: string[],
  signal?: AbortSignal,
): Promise<MarketQuote[]> =>
  sendMarketDataRequest<MarketQuote[]>(
    {
      type: MARKET_DATA_MESSAGE_TYPE,
      action: "quotes",
      secids,
    },
    signal,
  );
