import { Component, ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
          <div className="sf-title3" style={{ marginBottom: 8 }}>Etwas ist schiefgelaufen</div>
          <p className="sf-subhead" style={{ color: 'var(--label2)', marginBottom: 20 }}>
            Die App ist auf einen unerwarteten Fehler gestossen. Deine Daten in der Cloud sind davon nicht betroffen.
          </p>
          <button onClick={this.handleReload} className="btn-system">Neu laden</button>
        </div>
      </div>
    );
  }
}
