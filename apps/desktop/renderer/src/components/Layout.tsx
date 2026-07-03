import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../stores/app-store';
import { useUIStore } from '../stores/ui-store';
import Icon from './ui/Icon';
import WindowControls from './WindowControls';
import './Layout.css';

const navItems = [
  { path: '/dashboard', label: '全景看板', icon: 'dashboard' },
  { path: '/timeline', label: '对话时间线', icon: 'timeline' },
  { path: '/templates', label: '模板库', icon: 'library_books' },
  { path: '/settings', label: '设置', icon: 'settings' },
];

export default function Layout() {
  const { syncing, syncProgress, syncAll, cancelSync, invalidateCache, loadDashboard, loadTimeline, setSyncProgress } =
    useAppStore(
      useShallow((s) => ({
        syncing: s.syncing,
        syncProgress: s.syncProgress,
        syncAll: s.syncAll,
        cancelSync: s.cancelSync,
        invalidateCache: s.invalidateCache,
        loadDashboard: s.loadDashboard,
        loadTimeline: s.loadTimeline,
        setSyncProgress: s.setSyncProgress,
      }))
    );
  const requestSearchFocus = useUIStore((s) => s.requestSearchFocus);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        requestSearchFocus();
        navigate('/timeline');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, requestSearchFocus]);

  useEffect(() => {
    const unsubProgress = window.mirscope.onSyncProgress((p) => setSyncProgress(p));
    const unsubData = window.mirscope.onDataChanged(() => {
      invalidateCache();
      void loadDashboard(true);
      void loadTimeline();
    });
    return () => {
      unsubProgress();
      unsubData();
    };
  }, [invalidateCache, loadDashboard, loadTimeline, setSyncProgress]);

  return (
    <div className="app-shell">
      <div className="ambient-bg">
        <div className="ambient-bg__blob ambient-bg__blob--violet" />
        <div className="ambient-bg__blob ambient-bg__blob--cyan" />
      </div>

      <aside className="sidebar">
        <div className="sidebar__brand app-region-drag">
          <div className="sidebar__logo">
            <Icon name="auto_awesome" filled size={22} />
          </div>
          <div>
            <h1 className="sidebar__title">Mirscope</h1>
            <p className="sidebar__tagline">AI Prompt Analyzer</p>
          </div>
        </div>

        <nav className="sidebar__nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `sidebar__nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <button className="sidebar__sync btn btn-primary" onClick={() => syncAll()} disabled={syncing}>
          <Icon name="sync" />
          {syncing ? '同步中...' : '立即同步'}
        </button>
        <p className="sidebar__sync-hint">启动时自动同步；源文件变更时增量更新</p>

        {syncing && (
          <div className="sidebar__sync-progress">
            <div className="sidebar__sync-progress-bar">
              <div
                className="sidebar__sync-progress-fill"
                style={{ width: `${syncProgress?.progress ?? 10}%` }}
              />
            </div>
            <p className="sidebar__sync-progress-text">
              {syncProgress?.message ?? '准备同步...'}
            </p>
            <button type="button" className="btn btn-ghost btn-sm sidebar__sync-cancel" onClick={cancelSync}>
              取消
            </button>
          </div>
        )}
      </aside>

      <div className="main-shell">
        <header
          className="topbar app-region-drag"
          onDoubleClick={() => window.mirscope?.window?.maximize()}
        >
          <div className="topbar__right app-region-no-drag">
            <button type="button" className="topbar__icon-btn" aria-label="通知">
              <Icon name="notifications" />
              <span className="topbar__dot" />
            </button>
            <button type="button" className="topbar__icon-btn" onClick={() => navigate('/settings')} aria-label="设置">
              <Icon name="settings" />
            </button>
            <div className="topbar__avatar">
              <Icon name="person" filled />
            </div>
            <WindowControls />
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
