import { fetchIntradayData } from "@/shared/intradayApi";
import {
  isMarketDataRequest,
  type MarketDataRequest,
  type MarketDataResponse,
  type MarketDataResponsePayload,
} from "@/shared/marketDataMessages";
import { fetchMarketQuotes } from "@/shared/quoteApi";

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle_feature') return

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_FEATURE' })
    }
  })
})

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const handleMarketDataRequest = async (
  message: MarketDataRequest,
): Promise<MarketDataResponse<MarketDataResponsePayload>> => {
  try {
    if (message.action === "intraday") {
      return {
        ok: true,
        data: await fetchIntradayData(message.secid),
      };
    }

    return {
      ok: true,
      data: await fetchMarketQuotes(message.secids),
    };
  } catch (error) {
    return {
      ok: false,
      error: toErrorMessage(error),
    };
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isMarketDataRequest(message)) return false;

  void handleMarketDataRequest(message).then(sendResponse);
  return true;
});
