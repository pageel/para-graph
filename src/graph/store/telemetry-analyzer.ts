import { SessionTelemetryData } from '../models.js';

// @para-doc [#csa-trend-indicator]
export class TelemetryAnalyzer {
  public static analyzeTrends(data: SessionTelemetryData[]): {
    trendToolCalls: 'improving' | 'stable' | 'degrading';
    trendFriction: 'improving' | 'stable' | 'degrading';
  } {
    const K = data.length;
    if (K < 2) {
      return {
        trendToolCalls: 'stable',
        trendFriction: 'stable'
      };
    }

    const M = Math.floor(K / 2);
    const olderHalf = data.slice(0, M);
    const newerHalf = data.slice(K - M);

    const sumOlderToolCalls = olderHalf.reduce((sum, item) => sum + item.toolCallsTotal, 0);
    const sumNewerToolCalls = newerHalf.reduce((sum, item) => sum + item.toolCallsTotal, 0);
    const avgOlderToolCalls = sumOlderToolCalls / M;
    const avgNewerToolCalls = sumNewerToolCalls / M;

    const sumOlderFriction = olderHalf.reduce((sum, item) => sum + item.frictionCount, 0);
    const sumNewerFriction = newerHalf.reduce((sum, item) => sum + item.frictionCount, 0);
    const avgOlderFriction = sumOlderFriction / M;
    const avgNewerFriction = sumNewerFriction / M;

    const calculateTrend = (olderAvg: number, newerAvg: number): 'improving' | 'stable' | 'degrading' => {
      if (olderAvg === 0) {
        return newerAvg === 0 ? 'stable' : 'degrading';
      }
      const diff = (newerAvg - olderAvg) / olderAvg;
      if (diff <= -0.1) {
        return 'improving';
      }
      if (diff >= 0.1) {
        return 'degrading';
      }
      return 'stable';
    };

    return {
      trendToolCalls: calculateTrend(avgOlderToolCalls, avgNewerToolCalls),
      trendFriction: calculateTrend(avgOlderFriction, avgNewerFriction)
    };
  }
}
