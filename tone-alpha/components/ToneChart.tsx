"use client";

import { useEffect, useState, useRef } from "react";
import { SectorConfig } from "@/lib/sectors";
import { LightweightChart } from "./LightweightChart";
import styles from "./ToneChart.module.css";

interface ChartDataPoint {
  timestamp: number;
  price: number;
}

interface ChartResponse {
  id: string;
  name: string;
  symbol: string;
  data: ChartDataPoint[];
  timeframe: string;
  lastUpdated: string;
}

type Timeframe = "7d" | "30d" | "90d" | "1y";

interface ToneChartProps {
  sector: SectorConfig;
}

export function ToneChart({ sector }: ToneChartProps) {
  const [chartData, setChartData] = useState<ChartResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("1y");
  const chartContainerRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;

  useEffect(() => {
    const fetchChartData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch(`https://alpha.lab.tone.finance/api/v1/tones/${sector.id}/chart?timeframe=1y`);
        if (!response.ok) {
          throw new Error("Failed to fetch chart data");
        }
        const data = await response.json() as ChartResponse;
        setChartData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchChartData();
  }, [sector.id, setIsLoading, setError, setChartData]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Price Chart</h2>
        </div>
        <div className={styles.loadingState}>Loading chart...</div>
      </div>
    );
  }

  if (error || !chartData) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Price Chart</h2>
        </div>
        <div className={styles.errorState}>
          {error ? `Error: ${error}` : "No chart data available"}
        </div>
      </div>
    );
  }

  const data = chartData.data;
  if (data.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Price Chart</h2>
        </div>
        <div className={styles.emptyState}>No price data available</div>
      </div>
    );
  }

  // Format price display
  const currentPrice = data[data.length - 1].price;
  const previousPrice = data[0].price;
  const priceChange = currentPrice - previousPrice;
  const percentChange = ((priceChange / previousPrice) * 100).toFixed(2);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Price Chart</h2>
        </div>
        <div className={styles.timeframeButtons}>
          {(["7d", "30d", "90d", "1y"] as const).map((tf) => (
            <button
              key={tf}
              className={`${styles.timeframeButton} ${selectedTimeframe === tf ? styles.active : ""}`}
              onClick={() => setSelectedTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.priceInfo}>
        <div>
          <div className={styles.currentPrice}>${currentPrice.toFixed(6)}</div>
          <div
            className={`${styles.priceChange} ${priceChange >= 0 ? styles.positive : styles.negative}`}
          >
            {priceChange >= 0 ? "+" : ""}{priceChange.toFixed(6)} ({percentChange}%)
          </div>
        </div>
      </div>

      <div className={styles.chartWrapper}>
        <LightweightChart timeframe={selectedTimeframe} data={data} sector={sector} containerRef={chartContainerRef} />
      </div>

      <div className={styles.footer}>
        <div className={styles.footerText}>
          {`${chartData.timeframe} • Updated ${new Date(chartData.lastUpdated).toLocaleTimeString()}`}
        </div>
      </div>
    </div>
  );
}
