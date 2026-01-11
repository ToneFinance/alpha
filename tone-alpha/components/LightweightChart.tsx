"use client";

import { useEffect, useRef } from "react";
import { createChart, AreaSeries, ColorType } from "lightweight-charts";
import type {
  AreaData,
  Time,
  IChartApi,
  DeepPartial,
  ChartOptions,
  AreaSeriesPartialOptions,
} from "lightweight-charts";
import { SectorConfig } from "@/lib/sectors";
import { getDateRange } from "@/lib/time";
import { useTheme } from "@/lib/theme";

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

const lightTheme: {
  chart: DeepPartial<ChartOptions>;
  series: DeepPartial<AreaSeriesPartialOptions>;
} = {
  chart: {
    layout: {
      background: { type: ColorType.Solid, color: "#ffffff" },
      textColor: "#191919",
    },
    grid: {
      vertLines: { visible: false },
      horzLines: { color: "#f0f3fa" },
    },
    rightPriceScale: {
      borderVisible: false,
    },
    timeScale: {
      borderVisible: false,
    },
  },
  series: {
    topColor: "rgba(102, 126, 234, 0.4)",
    bottomColor: "rgba(102, 126, 234, 0.02)",
    lineColor: "rgba(102, 126, 234, 1)",
    lineWidth: 2,
  },
};

const darkTheme: {
  chart: DeepPartial<ChartOptions>;
  series: DeepPartial<AreaSeriesPartialOptions>;
} = {
  chart: {
    layout: {
      background: { type: ColorType.Solid, color: "#0a0a0a" },
      textColor: "#D9D9D9",
    },
    grid: {
      vertLines: { color: "rgba(255, 255, 255, 0.05)" },
      horzLines: { color: "rgba(255, 255, 255, 0.05)" },
    },
    rightPriceScale: {
      borderVisible: false,
    },
    timeScale: {
      borderVisible: false,
    },
  },
  series: {
    topColor: "rgba(102, 126, 234, 0.4)",
    bottomColor: "rgba(102, 126, 234, 0.02)",
    lineColor: "rgba(102, 126, 234, 1)",
    lineWidth: 2,
  },
};

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
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const container = containerRef?.current || internalRef.current;
    if (!container || data.length === 0) return;

    try {
      // Get theme options
      const themeOptions = resolvedTheme === "dark" ? darkTheme : lightTheme;

      // Initialize chart with theme
      const chart = createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        ...themeOptions.chart,
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

      // Add series with theme options
      const series = chart.addSeries(AreaSeries, themeOptions.series);

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
  }, [data, sector.color, resolvedTheme, containerRef]);

  useEffect(() => {
    if (!chartRef.current) return;

    _applyTimeFrame(chartRef.current, timeframe);
  }, [chartRef, timeframe]);

  return <div ref={internalRef} style={{ width: "100%", height: "240px" }} />;
}
