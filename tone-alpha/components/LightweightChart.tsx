"use client";

import { useEffect, useRef } from "react";
import { createChart, AreaSeries } from "lightweight-charts";
import type {
  AreaData,
  Time,
  IChartApi,
} from "lightweight-charts";
import { SectorConfig } from "@/lib/sectors";
import { getDateRange } from "@/lib/time";

interface ChartDataPoint {
  timestamp: number;
  price: number;
}

interface LightweightChartProps {
  data: ChartDataPoint[];
  sector: SectorConfig;
  containerRef?: React.RefObject<HTMLDivElement>;
  timeframe: "7d" | "30d" | "90d" | "1y";
}

function _applyTimeFrame(chart: IChartApi, timeframe: string) {
  const { from, to } = getDateRange(timeframe);
  chart.timeScale().setVisibleRange({
    from: Math.floor(from.getTime() / 1000) as Time,
    to: Math.floor(to.getTime() / 1000) as Time,
  });
}

export function LightweightChart({
  timeframe,
  data,
  sector,
  containerRef,
}: LightweightChartProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const container = containerRef?.current || internalRef.current;
    if (!container || data.length === 0) return;

    try {
      // Initialize chart with minimal options
      const chart = createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
      });

      // Transform data for lightweight-charts (use Unix timestamp in seconds)
      const chartData: AreaData<Time>[] = data
        .filter(
          (d) =>
            typeof d.timestamp === "number" &&
            typeof d.price === "number" &&
            d.price > 0
        )
        .map((d) => ({
          time: Math.floor(d.timestamp / 1000) as Time,
          value: d.price,
        }));

      if (chartData.length === 0) {
        console.warn("No valid chart data after filtering");
        return;
      }

      // Add series - try without any options first
      const series = chart.addSeries(AreaSeries);

      series.setData(chartData);
      series.priceScale().setAutoScale(true);

      chart.timeScale().fitContent();
      chartRef.current = chart;

      // Handle window resize
      const handleResize = () => {
        if (container && chartRef.current) {
          chartRef.current.applyOptions({
            width: container.clientWidth,
          });
        }
      };

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }
      };
    } catch (error) {
      console.error("Error creating chart:", error);
    }
  }, [data, sector.color, chartRef, containerRef]);

  useEffect(() => {
    if (!chartRef.current) return;

    _applyTimeFrame(chartRef.current, timeframe);
  }, [chartRef, timeframe]);

  return <div ref={internalRef} style={{ width: "100%", height: "240px" }} />;
}
