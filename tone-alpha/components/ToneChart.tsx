"use client";

import { useEffect, useState } from "react";
import { SectorConfig } from "@/lib/sectors";
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

type Timeframe = "7d" | "30d" | "90d";

interface ToneChartProps {
  sector: SectorConfig;
}

export function ToneChart({ sector }: ToneChartProps) {
  const [chartData, setChartData] = useState<ChartResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("30d");

  useEffect(() => {
    const fetchChartData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch(`/api/v1/tones/${sector.id}/chart?timeframe=${selectedTimeframe}`);
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
  }, [sector.id, selectedTimeframe]);

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

  // Calculate price range and chart dimensions
  const prices = data.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 0.1; // Prevent divide by zero
  const padding = priceRange * 0.1;

  // Chart dimensions with space for axes
  const chartInnerWidth = 550;
  const chartInnerHeight = 160;
  const leftMargin = 50;
  const bottomMargin = 40;
  const chartWidth = chartInnerWidth + leftMargin;
  const chartHeight = chartInnerHeight + bottomMargin + 20;
  const viewBox = `0 0 ${chartWidth} ${chartHeight}`;

  // Create SVG path for line chart
  const points = data.map((d, i) => {
    const x = leftMargin + (i / (data.length - 1)) * chartInnerWidth;
    const y = 20 + chartInnerHeight - ((d.price - minPrice + padding) / (priceRange + padding * 2)) * chartInnerHeight;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(" L ")}`;

  // Calculate Y-axis price labels (4 labels)
  const yLabels = [
    minPrice - padding,
    minPrice - padding + (priceRange + padding * 2) / 3,
    minPrice - padding + ((priceRange + padding * 2) / 3) * 2,
    maxPrice + padding,
  ];

  // Calculate X-axis time labels (4 labels)
  const xLabels = [
    { index: 0, label: new Date(data[0].timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }) },
    { index: Math.floor((data.length - 1) / 3), label: new Date(data[Math.floor((data.length - 1) / 3)].timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }) },
    { index: Math.floor(((data.length - 1) / 3) * 2), label: new Date(data[Math.floor(((data.length - 1) / 3) * 2)].timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }) },
    { index: data.length - 1, label: new Date(data[data.length - 1].timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }) },
  ];

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
          {(["7d", "30d", "90d"] as Timeframe[]).map((tf) => (
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
        <svg viewBox={viewBox} className={styles.chart}>
          {/* Gradient for line */}
          <defs>
            <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={sector.color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={sector.color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Y-axis */}
          <line
            x1={leftMargin}
            y1={20}
            x2={leftMargin}
            y2={20 + chartInnerHeight}
            stroke="var(--card-border)"
            strokeWidth="1"
          />

          {/* X-axis */}
          <line
            x1={leftMargin}
            y1={20 + chartInnerHeight}
            x2={leftMargin + chartInnerWidth}
            y2={20 + chartInnerHeight}
            stroke="var(--card-border)"
            strokeWidth="1"
          />

          {/* Y-axis labels and grid lines */}
          {yLabels.map((price, i) => {
            const y = 20 + chartInnerHeight - ((price - (minPrice - padding)) / (priceRange + padding * 2)) * chartInnerHeight;
            return (
              <g key={`y-${i}`}>
                {/* Grid line */}
                <line
                  x1={leftMargin}
                  y1={y}
                  x2={leftMargin + chartInnerWidth}
                  y2={y}
                  stroke="var(--card-border)"
                  strokeWidth="0.5"
                  opacity="0.3"
                />
                {/* Label */}
                <text
                  x={leftMargin - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--text-tertiary)"
                  fontWeight="500"
                >
                  ${price.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* X-axis labels and tick marks */}
          {xLabels.map((label, i) => {
            const x = leftMargin + (label.index / (data.length - 1)) * chartInnerWidth;
            return (
              <g key={`x-${i}`}>
                {/* Tick mark */}
                <line
                  x1={x}
                  y1={20 + chartInnerHeight}
                  x2={x}
                  y2={20 + chartInnerHeight + 4}
                  stroke="var(--card-border)"
                  strokeWidth="1"
                />
                {/* Label */}
                <text
                  x={x}
                  y={20 + chartInnerHeight + 16}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--text-tertiary)"
                  fontWeight="500"
                >
                  {label.label}
                </text>
              </g>
            );
          })}

          {/* Area under line */}
          <path
            d={`${pathD} L ${leftMargin + chartInnerWidth},${20 + chartInnerHeight} L ${leftMargin},${20 + chartInnerHeight} Z`}
            fill="url(#chartGradient)"
          />

          {/* Line */}
          <path d={pathD} stroke={sector.color} strokeWidth="2" fill="none" />

          {/* Dots at data points */}
          {points.map((point, i) => {
            const [x, y] = point.split(",").map(Number);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="2"
                fill={sector.color}
                opacity={i === data.length - 1 ? 1 : 0.3}
              />
            );
          })}
        </svg>
      </div>

      <div className={styles.footer}>
        <div className={styles.footerText}>
          {`${chartData.timeframe} • Updated ${new Date(chartData.lastUpdated).toLocaleTimeString()}`}
        </div>
      </div>
    </div>
  );
}
