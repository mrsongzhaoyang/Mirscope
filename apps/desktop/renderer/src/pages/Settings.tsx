import { useEffect, useState } from 'react';
import type { AIProviderConfig, AppPreferences } from '@mirscope/shared';
import GlassCard from '../components/ui/GlassCard';
import Icon from '../components/ui/Icon';
import './Settings.css';

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic (Claude)' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'openrouter', name: 'OpenRouter' },
];

export default function Settings() {
  const [config, setConfig] = useState<AIProviderConfig>({
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4o-mini',
    baseUrl: '',
  });
  const [preferences, setPreferences] = useState<AppPreferences>({
    wordCloudLimit: 60,
    templateMinScore: 85,
    languageMixedThreshold: 0.3,
    languageChineseThreshold: 0.7,
  });
  const [connectors, setConnectors] = useState<
    Array<{ id: string; name: string; installed: boolean; dataPaths?: string[]; message?: string }>
  >([]);
  const [saved, setSaved] = useState(false);
  const [dataMsg, setDataMsg] = useState('');
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const refreshConnectors = () => {
    void window.mirscope.connectors.detect().then(setConnectors);
  };

  useEffect(() => {
    window.mirscope.settings.get().then((s) => {
      setConfig(s.aiProvider);
      setPreferences(s.preferences);
    });
    refreshConnectors();
  }, []);

  const handleConnectorSync = async (id: string) => {
    setSyncingId(id);
    setDataMsg('');
    try {
      const result = await window.mirscope.connectors.sync(id);
      setDataMsg(`${result.platform}: 新增 ${result.imported} 条`);
      refreshConnectors();
    } catch (err) {
      setDataMsg(String(err));
    } finally {
      setSyncingId(null);
    }
  };

  const handleSave = async () => {
    await window.mirscope.settings.save({ aiProvider: config, preferences });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExport = async (format: 'json' | 'csv') => {
    setDataMsg('导出中...');
    const result = await window.mirscope.data.export(format);
    setDataMsg(result.ok ? `已导出至 ${result.path}` : result.error ?? '已取消');
    setTimeout(() => setDataMsg(''), 4000);
  };

  const handleBackup = async () => {
    setDataMsg('备份中...');
    const result = await window.mirscope.data.backup();
    setDataMsg(result.ok ? `已备份至 ${result.path}` : result.error ?? '已取消');
    setTimeout(() => setDataMsg(''), 4000);
  };

  return (
    <div className="page-content settings-page">
      <div className="settings-header">
        <div className="page-eyebrow">
          <Icon name="settings" size={18} />
          System Configuration
        </div>
        <h2 className="page-title">系统设置</h2>
        <p className="page-subtitle">Local First — 所有数据与 API Key 均加密存储在本地</p>
      </div>

      <div className="settings-grid">
        <GlassCard className="settings-card">
          <div className="settings-card__header">
            <Icon name="smart_toy" />
            <div>
              <h3>AI 模型配置</h3>
              <p>用于 Prompt 智能评分与优化改写，调用用户自有模型 API</p>
            </div>
          </div>

          <div className="form-grid">
            <label className="form-field">
              <span className="label-upper">模型服务商</span>
              <select
                value={config.provider}
                onChange={(e) => setConfig({ ...config, provider: e.target.value })}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span className="label-upper">API Key</span>
              <input
                type="password"
                placeholder="sk-..."
                value={config.apiKey}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              />
            </label>

            <label className="form-field">
              <span className="label-upper">模型名称</span>
              <input
                type="text"
                placeholder="gpt-4o-mini"
                value={config.model ?? ''}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
              />
            </label>

            <label className="form-field">
              <span className="label-upper">API Base URL（可选）</span>
              <input
                type="text"
                placeholder="https://api.openai.com/v1"
                value={config.baseUrl ?? ''}
                onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
              />
            </label>
          </div>

          <button type="button" className="btn btn-primary" onClick={handleSave}>
            <Icon name={saved ? 'check' : 'save'} size={18} />
            {saved ? '已保存' : '保存配置'}
          </button>
        </GlassCard>

        <GlassCard className="settings-card">
          <div className="settings-card__header">
            <Icon name="tune" />
            <div>
              <h3>分析偏好</h3>
              <p>词云、模板库与语言检测参数</p>
            </div>
          </div>

          <div className="form-grid">
            <label className="form-field">
              <span className="label-upper">词云词条数</span>
              <input
                type="number"
                min={20}
                max={120}
                value={preferences.wordCloudLimit}
                onChange={(e) =>
                  setPreferences({ ...preferences, wordCloudLimit: Number(e.target.value) || 60 })
                }
              />
            </label>
            <label className="form-field">
              <span className="label-upper">模板最低分</span>
              <input
                type="number"
                min={60}
                max={100}
                value={preferences.templateMinScore}
                onChange={(e) =>
                  setPreferences({ ...preferences, templateMinScore: Number(e.target.value) || 85 })
                }
              />
            </label>
            <label className="form-field">
              <span className="label-upper">混合语阈值 (0-1)</span>
              <input
                type="number"
                min={0.1}
                max={0.9}
                step={0.05}
                value={preferences.languageMixedThreshold}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    languageMixedThreshold: Number(e.target.value) || 0.3,
                  })
                }
              />
            </label>
            <label className="form-field">
              <span className="label-upper">中文判定阈值 (0-1)</span>
              <input
                type="number"
                min={0.5}
                max={1}
                step={0.05}
                value={preferences.languageChineseThreshold}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    languageChineseThreshold: Number(e.target.value) || 0.7,
                  })
                }
              />
            </label>
          </div>
        </GlassCard>

        <GlassCard className="settings-card">
          <div className="settings-card__header">
            <Icon name="download" />
            <div>
              <h3>数据导出与备份</h3>
              <p>导出 Prompt 为 JSON/CSV，或备份完整 SQLite 数据库</p>
            </div>
          </div>

          <div className="settings-actions">
            <button type="button" className="btn btn-ghost" onClick={() => handleExport('json')}>
              导出 JSON
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => handleExport('csv')}>
              导出 CSV
            </button>
            <button type="button" className="btn btn-primary" onClick={handleBackup}>
              备份数据库
            </button>
          </div>
          {dataMsg && <p className="settings-data-msg">{dataMsg}</p>}
        </GlassCard>

        <GlassCard className="settings-card">
          <div className="settings-card__header">
            <Icon name="extension" />
            <div>
              <h3>采集插件状态</h3>
              <p>检测本地 AI 工具安装与数据目录</p>
            </div>
          </div>

          <div className="connector-list">
            {connectors.map((c) => (
              <div key={c.id} className="connector-item">
                <div className="connector-item__main">
                  <span className="connector-item__name">{c.name}</span>
                  <span className={`connector-status ${c.installed ? 'online' : 'offline'}`}>
                    {c.installed ? '已检测到' : '未检测到'}
                  </span>
                  {c.installed && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={syncingId !== null}
                      onClick={() => handleConnectorSync(c.id)}
                    >
                      {syncingId === c.id ? '同步中...' : '单独同步'}
                    </button>
                  )}
                </div>
                {c.message && <p className="connector-item__msg">{c.message}</p>}
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="settings-card settings-card--about">
          <div className="settings-card__header">
            <Icon name="visibility" filled />
            <div>
              <h3>关于 Mirscope</h3>
              <p>全身镜 · 全景镜面，全维洞察</p>
            </div>
          </div>
          <div className="about-content">
            <p className="about-version">
              <strong>Mirscope（全身镜）</strong> v1.0.0
            </p>
            <p className="about-slogan">Full Mirror, Full Insight</p>
            <p className="about-desc">
              本地优先的 AI Prompt 全景分析平台。所有对话数据默认仅存储本地，无强制云端上传。
              AI 评分与优化能力均调用用户自有模型 API。
            </p>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
