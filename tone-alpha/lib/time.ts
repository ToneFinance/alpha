/**
 * Calculate date range based on timeframe
 */
export function getDateRange(timeframe: string): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();

  switch (timeframe) {
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "90d":
      from.setDate(from.getDate() - 90);
      break;
    case "1y":
      from.setDate(from.getDate() - 365);
      break;
    case "30d":
    default:
      from.setDate(from.getDate() - 30);
      break;
  }

  return { from, to };
}