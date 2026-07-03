import { useEffect, useMemo, useState } from 'react';
import type { TimelineNavGroup } from '@mirscope/shared';
import 'echarts-wordcloud';
import { useAppStore } from '../stores/app-store';
import GlassCard from '../components/ui/GlassCard';
import LazyChart from '../components/ui/LazyChart';
import { chartColors, chartTheme, glassTooltip, heatmapColors } from '../utils/chart-theme';
import './Dashboard.css';

const PLATFORM_LABELS: Record<string, string> = {
  cursor: 'Cursor',
  trae: 'Trae',
  'codebuddy': 'CodeBuddy',
  'claude-code': 'Claude Code',
};

function platformLabel(id: string): string {
  return PLATFORM_LABELS[id] ?? id;
}

function flattenTopProjects(nav: TimelineNavGroup[], limit = 5) {
  const all: Array<{ name: string; platform: string; count: number }> = [];
  for (const group of nav) {
    for (const project of group.projects) {
      all.push({ name: project.name, platform: group.platform, count: project.count });
    }
  }
  return all.sort((a, b) => b.count - a.count).slice(0, limit);
}

const DAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
/** 热力图横轴：24 个整点槽位，刻度每 4 小时显示一次 */
const HOUR_SLOTS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));

function buildHeatmapSeries(data: Array<{ hour: number; day: number; count: number }>) {
  const lookup = new Map<string, number>();
  for (const d of data) {
    if (d.hour >= 0 && d.hour < 24 && d.day >= 0 && d.day < 7) {
      lookup.set(`${d.day}-${d.hour}`, d.count);
    }
  }

  const heatData: Array<[number, number, number]> = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      heatData.push([hour, day, lookup.get(`${day}-${hour}`) ?? 0]);
    }
  }
  return heatData;
}

export default function Dashboard() {
  const { dashboard, loadDashboard } = useAppStore();
  const [wordData, setWordData] = useState<Array<{ name: string; value: number }>>([]);
  const [heatmapRaw, setHeatmapRaw] = useState<Array<{ hour: number; day: number; count: number }>>([]);
  const [timelineNav, setTimelineNav] = useState<TimelineNavGroup[]>([]);

  const reloadCharts = () => {
    void window.mirscope.settings.get().then((s) => {
      const limit = s.preferences.wordCloudLimit;
      void Promise.all([
        loadDashboard(true),
        window.mirscope.analytics.wordcloud(limit).then(setWordData),
        window.mirscope.analytics.heatmap().then(setHeatmapRaw),
        window.mirscope.analytics.timelineNav().then(setTimelineNav),
      ]);
    });
  };

  useEffect(() => {
    reloadCharts();
  }, [loadDashboard]);

  useEffect(() => {
    const unsub = window.mirscope.onDataChanged(reloadCharts);
    return unsub;
  }, [loadDashboard]);

  const platformBarOption = useMemo(() => {
    if (!dashboard?.platformBreakdown.length) return null;
    const platforms = dashboard.platformBreakdown.slice(0, 6);
    return {
      animation: false,
      ...chartTheme,
      tooltip: { trigger: 'axis', ...glassTooltip },
      grid: { left: 8, right: 8, bottom: 4, top: 8, containLabel: true },
      xAxis: {
        type: 'category',
        data: platforms.map((p) => platformLabel(p.platform)),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#958ea0', fontSize: 10, interval: 0 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
        axisLabel: { color: '#958ea0', fontSize: 9 },
      },
      series: [
        {
          type: 'bar',
          barWidth: '50%',
          data: platforms.map((p) => p.count),
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: chartColors.primary },
                { offset: 1, color: chartColors.indigo },
              ],
            },
          },
        },
      ],
    };
  }, [dashboard?.platformBreakdown]);

  const topProjects = useMemo(() => flattenTopProjects(timelineNav, 5), [timelineNav]);

  const projectBarOption = useMemo(() => {
    if (!topProjects.length) return null;
    return {
      animation: false,
      ...chartTheme,
      tooltip: {
        trigger: 'axis',
        ...glassTooltip,
        formatter: (params: Array<{ name: string; value: number; dataIndex: number }>) => {
          const item = topProjects[params[0]?.dataIndex ?? 0];
          if (!item) return '';
          return `${item.name}<br/>${platformLabel(item.platform)} · ${item.count} 条`;
        },
      },
      grid: { left: 8, right: 16, bottom: 4, top: 8, containLabel: true },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
        axisLabel: { color: '#958ea0', fontSize: 9 },
      },
      yAxis: {
        type: 'category',
        data: topProjects.map((p) => p.name).reverse(),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#cbc3d7',
          fontSize: 10,
          width: 72,
          overflow: 'truncate',
        },
      },
      series: [
        {
          type: 'bar',
          barWidth: '55%',
          data: topProjects.map((p) => p.count).reverse(),
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 1,
              y2: 0,
              colorStops: [
                { offset: 0, color: chartColors.violet },
                { offset: 1, color: chartColors.cyan },
              ],
            },
          },
        },
      ],
    };
  }, [topProjects]);

  const wordOption = useMemo(() => {
    if (!wordData.length) return null;
    const palette = [chartColors.cyan, chartColors.violet, chartColors.primary, '#fff'];
    return {
      animation: false,
      series: [
        {
          type: 'wordCloud',
          shape: 'circle',
          width: '100%',
          height: '100%',
          sizeRange: [10, 26],
          rotationRange: [0, 0],
          gridSize: 14,
          textStyle: {
            fontFamily: 'Inter, PingFang SC, sans-serif',
            color: (params: { dataIndex: number }) => palette[params.dataIndex % palette.length],
          },
          data: wordData,
        },
      ],
    };
  }, [wordData]);

  const heatmapOption = useMemo(() => {
    const heatData = buildHeatmapSeries(heatmapRaw);
    const maxVal = Math.max(...heatData.map((d) => d[2]), 1);

    return {
      animation: false,
      ...chartTheme,
      tooltip: {
        position: 'top',
        ...glassTooltip,
        formatter: (p: { value: [number, number, number] }) => {
          const [hour, day, count] = p.value;
          const hh = String(hour).padStart(2, '0');
          return `${DAY_LABELS[day] ?? day} ${hh}:00 — ${count} 条`;
        },
      },
      grid: { top: 8, left: 44, right: 12, bottom: 36 },
      xAxis: {
        type: 'category',
        data: HOUR_SLOTS,
        position: 'bottom',
        splitArea: { show: false },
        axisLine: { show: true, lineStyle: { color: 'rgba(255,255,255,0.12)' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#cbc3d7',
          fontSize: 9,
          interval: 3,
          formatter: (hour: string) => `${hour}:00`,
          margin: 10,
        },
      },
      yAxis: {
        type: 'category',
        data: DAY_LABELS,
        splitArea: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#cbc3d7', fontSize: 10 },
      },
      visualMap: {
        min: 0,
        max: maxVal,
        show: false,
        calculable: false,
        inRange: { color: heatmapColors },
      },
      series: [
        {
          type: 'heatmap',
          data: heatData,
          emphasis: { disabled: true },
          itemStyle: {
            borderColor: 'rgba(11, 19, 38, 0.9)',
            borderWidth: 2,
          },
        },
      ],
    };
  }, [heatmapRaw]);

  if (!dashboard) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-stats">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-card" />
          ))}
        </div>
        <div className="dashboard-body">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`skeleton-panel skeleton-panel--${i}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-stats">
        <GlassCard className="stat-card" flat>
          <p className="stat-card__label">Prompt 总量</p>
          <p className="stat-card__value">{dashboard.totalPrompts.toLocaleString()}</p>
          <p className="stat-card__meta">累计入库</p>
        </GlassCard>
        <GlassCard className="stat-card" flat>
          <p className="stat-card__label">本周 / 今日</p>
          <p className="stat-card__value">
            {dashboard.weekCount} <span className="stat-card__sep">/</span> {dashboard.todayCount}
          </p>
          <p className="stat-card__meta">条 Prompt</p>
        </GlassCard>
        <GlassCard className="stat-card" flat>
          <p className="stat-card__label">本月活跃</p>
          <p className="stat-card__value">{dashboard.monthCount.toLocaleString()}</p>
          <p className="stat-card__meta">条 Prompt</p>
        </GlassCard>
        <GlassCard className="stat-card" flat>
          <p className="stat-card__label">平均长度</p>
          <p className="stat-card__value">{dashboard.avgPromptLength}</p>
          <p className="stat-card__meta">字符 / 条</p>
        </GlassCard>
      </div>

      <div className="dashboard-body">
        <GlassCard className="chart-panel chart-panel--heatmap" flat>
          <p className="chart-panel__title">使用时段热力图</p>
          <p className="chart-panel__subtitle">横轴每 4 小时一刻度（00:00 – 20:00），颜色越深使用越频繁</p>
          <div className="chart-panel__body">
            <LazyChart option={heatmapOption} />
          </div>
        </GlassCard>

        <GlassCard className="chart-panel chart-panel--bar" flat>
          <p className="chart-panel__title">平台分布</p>
          <p className="chart-panel__subtitle">各 IDE / CLI 采集到的 Prompt 数量</p>
          <div className="chart-panel__body">
            {platformBarOption ? <LazyChart option={platformBarOption} /> : <ChartEmpty text="暂无平台数据，请先同步" />}
          </div>
        </GlassCard>

        <GlassCard className="chart-panel chart-panel--pie" flat>
          <p className="chart-panel__title">活跃项目 Top 5</p>
          <p className="chart-panel__subtitle">按项目聚合的 Prompt 数量</p>
          <div className="chart-panel__body">
            {projectBarOption ? <LazyChart option={projectBarOption} /> : <ChartEmpty text="暂无项目数据" />}
          </div>
        </GlassCard>

        <GlassCard className="chart-panel chart-panel--wordcloud" flat>
          <p className="chart-panel__title">高频 Prompt</p>
          <p className="chart-panel__subtitle">重复最多的 Prompt 开头短语（最多 6 字）</p>
          <div className="chart-panel__body">
            {wordOption ? <LazyChart option={wordOption} /> : <ChartEmpty text="暂无 Prompt 数据" />}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function ChartEmpty({ text }: { text: string }) {
  return <div className="chart-empty">{text}</div>;
}
