import { memo } from 'react';
import ReactECharts from 'echarts-for-react';

interface LazyChartProps {
  option: object;
  className?: string;
}

function LazyChart({ option, className }: LazyChartProps) {
  return (
    <ReactECharts
      className={className}
      option={option}
      style={{ height: '100%', width: '100%', minHeight: 0 }}
      opts={{ renderer: 'canvas' }}
      lazyUpdate
    />
  );
}

export default memo(LazyChart);
