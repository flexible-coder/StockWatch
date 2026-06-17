export interface IntradayPoint {
  time: number;
  realTime: number;
  marketTime: string;
  minuteIndex: number;
  value: number;
  avgPrice: number;
  volume: number;
  amount: number;
}

export interface IntradayData {
  secid: string;
  name: string;
  preClose: number;
  currentPrice: number;
  percent: number;
  points: IntradayPoint[];
}

type EastMoneyIntradayPayload = {
  data?: {
    name?: string;
    preClose?: number | string;
    trends?: string[];
  };
};

const INTRADAY_API_URL =
  "https://push2.eastmoney.com/api/qt/stock/trends2/get";

export const MARKET_UTC_OFFSET_HOURS = 8;
export const MORNING_SESSION_START_MINUTE = 9 * 60 + 30;
export const MORNING_SESSION_END_MINUTE = 11 * 60 + 30;
export const AFTERNOON_SESSION_START_MINUTE = 13 * 60;
export const AFTERNOON_SESSION_END_MINUTE = 15 * 60;
export const MORNING_SESSION_POINT_COUNT =
  MORNING_SESSION_END_MINUTE - MORNING_SESSION_START_MINUTE + 1;
export const LAST_TRADING_MINUTE_INDEX = 240;

export const fullTradingMinuteIndexes = Array.from(
  { length: LAST_TRADING_MINUTE_INDEX + 1 },
  (_, minuteIndex) => minuteIndex,
);

export const minuteIndexToSyntheticTimestamp = (minuteIndex: number): number =>
  minuteIndex;

export const syntheticTimestampToMinuteIndex = (
  timestamp: number,
): number | null => {
  const minuteIndex = Math.round(timestamp);
  if (!Number.isInteger(minuteIndex)) return null;
  if (minuteIndex < 0 || minuteIndex > LAST_TRADING_MINUTE_INDEX) return null;
  return minuteIndex;
};

const parseFiniteNumber = (value: string | number | undefined): number | null => {
  if (value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getTrendPrice = (fields: string[]): number | null => {
  return parseFiniteNumber(fields[2]) ?? parseFiniteNumber(fields[1]);
};

const getTrendAveragePrice = (fields: string[], price: number): number => {
  const apiAveragePrice = parseFiniteNumber(fields[7]);
  if (apiAveragePrice && apiAveragePrice > 0) return apiAveragePrice;

  const volume = parseFiniteNumber(fields[5]);
  const amount = parseFiniteNumber(fields[6]);
  if (volume && amount && volume > 0) {
    const isReasonableAverage = (value: number) =>
      value > price * 0.2 && value < price * 5;
    const directAverage = amount / volume;
    if (
      Number.isFinite(directAverage) &&
      directAverage > 0 &&
      isReasonableAverage(directAverage)
    ) {
      return directAverage;
    }

    const handAverage = amount / (volume * 100);
    if (
      Number.isFinite(handAverage) &&
      handAverage > 0 &&
      isReasonableAverage(handAverage)
    ) {
      return handAverage;
    }
  }

  return price;
};

const shanghaiMinutesFromTimestamp = (timestamp: number): number => {
  const shanghaiDate = new Date(
    (timestamp + MARKET_UTC_OFFSET_HOURS * 3600) * 1000,
  );
  return shanghaiDate.getUTCHours() * 60 + shanghaiDate.getUTCMinutes();
};

export const shanghaiMinutesToTradingMinuteIndex = (
  minutes: number,
): number | null => {
  if (
    minutes >= MORNING_SESSION_START_MINUTE &&
    minutes <= MORNING_SESSION_END_MINUTE
  ) {
    return minutes - MORNING_SESSION_START_MINUTE;
  }

  if (
    minutes >= AFTERNOON_SESSION_START_MINUTE &&
    minutes <= AFTERNOON_SESSION_END_MINUTE
  ) {
    if (minutes === AFTERNOON_SESSION_END_MINUTE) {
      return LAST_TRADING_MINUTE_INDEX;
    }

    const minuteIndex =
      MORNING_SESSION_POINT_COUNT + (minutes - AFTERNOON_SESSION_START_MINUTE);
    return minuteIndex <= LAST_TRADING_MINUTE_INDEX ? minuteIndex : null;
  }

  return null;
};

const timestampToTradingMinuteIndex = (timestamp: number): number | null => {
  return shanghaiMinutesToTradingMinuteIndex(
    shanghaiMinutesFromTimestamp(timestamp),
  );
};

const extractMarketMinutesFromDateTimeText = (
  dateTimeText: string,
): number | null => {
  const fullDateTimeMatch = dateTimeText.match(
    /^\d{4}-\d{2}-\d{2}\s+(\d{2}):(\d{2})$/,
  );
  if (fullDateTimeMatch) {
    return Number(fullDateTimeMatch[1]) * 60 + Number(fullDateTimeMatch[2]);
  }

  const timeOnlyMatch = dateTimeText.match(/^(\d{2}):(\d{2})$/);
  if (timeOnlyMatch) {
    return Number(timeOnlyMatch[1]) * 60 + Number(timeOnlyMatch[2]);
  }

  return null;
};

const dateTimeTextToTradingMinuteIndex = (
  dateTimeText: string,
): number | null => {
  const minutes = extractMarketMinutesFromDateTimeText(dateTimeText);
  if (typeof minutes !== "number") return null;
  return shanghaiMinutesToTradingMinuteIndex(minutes);
};

const formatClockFromMinutes = (minutes: number): string => {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

export const formatMarketTimeFromMinuteIndex = (minuteIndex: number): string => {
  if (minuteIndex < 0 || minuteIndex > LAST_TRADING_MINUTE_INDEX) return "";
  if (minuteIndex === LAST_TRADING_MINUTE_INDEX) return "15:00";
  if (minuteIndex < MORNING_SESSION_POINT_COUNT) {
    return formatClockFromMinutes(MORNING_SESSION_START_MINUTE + minuteIndex);
  }
  return formatClockFromMinutes(
    AFTERNOON_SESSION_START_MINUTE +
      (minuteIndex - MORNING_SESSION_POINT_COUNT),
  );
};

const formatMarketTimeFromDateTimeText = (dateTimeText: string): string => {
  const minutes = extractMarketMinutesFromDateTimeText(dateTimeText);
  if (typeof minutes !== "number") return "";
  return formatClockFromMinutes(minutes);
};

export const formatAxisTimeFromMinuteIndex = (
  minuteIndex: number | null,
): string => {
  if (minuteIndex === null) return "";
  if (minuteIndex === 0) return "09:30";
  if (minuteIndex === 120) return "11:30";
  if (minuteIndex === LAST_TRADING_MINUTE_INDEX) return "15:00";
  return "";
};

const parseEastMoneyDateTimeToTimestamp = (
  dateTimeText: string,
): number | null => {
  const fullDateTimeMatch = dateTimeText.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/,
  );
  if (fullDateTimeMatch) {
    const year = Number(fullDateTimeMatch[1]);
    const month = Number(fullDateTimeMatch[2]);
    const day = Number(fullDateTimeMatch[3]);
    const hours = Number(fullDateTimeMatch[4]);
    const minutes = Number(fullDateTimeMatch[5]);
    return Math.floor(
      Date.UTC(year, month - 1, day, hours - MARKET_UTC_OFFSET_HOURS, minutes) /
        1000,
    );
  }

  const timeOnlyMatch = dateTimeText.match(/^(\d{2}):(\d{2})$/);
  if (timeOnlyMatch) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();
    const hours = Number(timeOnlyMatch[1]);
    const minutes = Number(timeOnlyMatch[2]);
    return Math.floor(
      Date.UTC(year, month, day, hours - MARKET_UTC_OFFSET_HOURS, minutes) /
        1000,
    );
  }

  return null;
};

export const fetchIntradayData = async (
  secid: string,
  signal?: AbortSignal,
): Promise<IntradayData> => {
  const query = new URLSearchParams({
    secid,
    fields1: "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58",
    ut: "fa5fd1943c7b386f172d6893dbfba10b",
    ndays: "1",
    iscr: "0",
    iscca: "0",
  });

  const response = await fetch(`${INTRADAY_API_URL}?${query.toString()}`, {
    headers: { "Cache-Control": "no-cache" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Intraday request failed: ${response.status}`);
  }

  const result = (await response.json()) as EastMoneyIntradayPayload;
  const trends = result.data?.trends ?? [];
  const preClose = Number(result.data?.preClose) || 0;
  const parsedDataByMinute = new Map<number, IntradayPoint>();
  let currentPrice = 0;

  for (const item of trends) {
    const fields = item.split(",");
    const timeStr = fields[0];
    const price = getTrendPrice(fields) ?? 0;
    const avgPrice = getTrendAveragePrice(fields, price);
    const volume = parseFiniteNumber(fields[5]) ?? 0;
    const amount = parseFiniteNumber(fields[6]) ?? 0;

    if (price <= 0 || avgPrice <= 0) continue;

    const timestamp = parseEastMoneyDateTimeToTimestamp(timeStr);
    if (typeof timestamp !== "number") continue;

    const minuteIndex =
      dateTimeTextToTradingMinuteIndex(timeStr) ??
      timestampToTradingMinuteIndex(timestamp);
    if (typeof minuteIndex !== "number") continue;

    parsedDataByMinute.set(minuteIndex, {
      time: minuteIndexToSyntheticTimestamp(minuteIndex),
      realTime: timestamp,
      marketTime:
        formatMarketTimeFromDateTimeText(timeStr) ||
        formatMarketTimeFromMinuteIndex(minuteIndex),
      minuteIndex,
      value: price,
      avgPrice,
      volume,
      amount,
    });
    currentPrice = price;
  }

  const points = Array.from(parsedDataByMinute.values()).sort(
    (left, right) => left.minuteIndex - right.minuteIndex,
  );

  return {
    secid,
    name: result.data?.name ?? "",
    preClose,
    currentPrice,
    percent:
      currentPrice > 0 && preClose > 0
        ? ((currentPrice - preClose) / preClose) * 100
        : 0,
    points,
  };
};
