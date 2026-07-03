import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page-content" style={{ padding: 40 }}>
          <h2 style={{ marginBottom: 8 }}>页面渲染出错</h2>
          <p style={{ color: 'var(--on-surface-variant)', marginBottom: 16 }}>
            {this.state.error.message}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
