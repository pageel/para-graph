import { describe, it, expect } from 'vitest';
import { TelemetryAnalyzer } from '../../../src/graph/store/telemetry-analyzer.js';
import { SessionTelemetryData } from '../../../src/graph/models.js';

// @para-doc [#csa-test-query-trends]
describe('TelemetryAnalyzer', () => {
  const createMockTelemetry = (
    id: string,
    toolCallsTotal: number,
    frictionCount: number,
    capturedAt: number
  ): SessionTelemetryData => ({
    id,
    projectName: 'test-project',
    conversationId: 'conv-id',
    toolCallsTotal,
    toolCallsBreakdown: {},
    filesReadCount: 0,
    filesReadList: [],
    filesChangedCount: 0,
    filesChangedList: [],
    tokenEstimateInput: 1000,
    tokenEstimateOutput: 500,
    frictionCount,
    frictionDetails: [],
    capturedAt
  });

  describe('analyzeTrends', () => {
    it('returns stable trends when data points are less than 2', () => {
      const data: SessionTelemetryData[] = [
        createMockTelemetry('1', 10, 0, 1000)
      ];
      const result = TelemetryAnalyzer.analyzeTrends(data);
      expect(result.trendToolCalls).toBe('stable');
      expect(result.trendFriction).toBe('stable');
    });

    it('identifies stable trends when changes are within 10%', () => {
      const data: SessionTelemetryData[] = [
        createMockTelemetry('1', 10, 2, 1000),
        createMockTelemetry('2', 10, 2, 2000),
        createMockTelemetry('3', 10, 2, 3000),
        createMockTelemetry('4', 10, 2, 4000)
      ];
      const result = TelemetryAnalyzer.analyzeTrends(data);
      expect(result.trendToolCalls).toBe('stable');
      expect(result.trendFriction).toBe('stable');
    });

    it('identifies improving trends when values decrease by 10% or more', () => {
      const data: SessionTelemetryData[] = [
        createMockTelemetry('1', 20, 10, 1000),
        createMockTelemetry('2', 20, 10, 2000),
        createMockTelemetry('3', 18, 9, 3000),
        createMockTelemetry('4', 18, 9, 4000)
      ];
      const result = TelemetryAnalyzer.analyzeTrends(data);
      expect(result.trendToolCalls).toBe('improving');
      expect(result.trendFriction).toBe('improving');
    });

    it('identifies degrading trends when values increase by 10% or more', () => {
      const data: SessionTelemetryData[] = [
        createMockTelemetry('1', 10, 5, 1000),
        createMockTelemetry('2', 10, 5, 2000),
        createMockTelemetry('3', 11, 6, 3000),
        createMockTelemetry('4', 11, 6, 4000)
      ];
      const result = TelemetryAnalyzer.analyzeTrends(data);
      expect(result.trendToolCalls).toBe('degrading');
      expect(result.trendFriction).toBe('degrading');
    });

    it('handles older half average being 0 correctly', () => {
      const data1 = [
        createMockTelemetry('1', 0, 0, 1000),
        createMockTelemetry('2', 0, 0, 2000),
        createMockTelemetry('3', 0, 0, 3000),
        createMockTelemetry('4', 0, 0, 4000)
      ];
      const result1 = TelemetryAnalyzer.analyzeTrends(data1);
      expect(result1.trendToolCalls).toBe('stable');
      expect(result1.trendFriction).toBe('stable');

      const data2 = [
        createMockTelemetry('1', 0, 0, 1000),
        createMockTelemetry('2', 0, 0, 2000),
        createMockTelemetry('3', 5, 2, 3000),
        createMockTelemetry('4', 5, 2, 4000)
      ];
      const result2 = TelemetryAnalyzer.analyzeTrends(data2);
      expect(result2.trendToolCalls).toBe('degrading');
      expect(result2.trendFriction).toBe('degrading');
    });
  });
});
