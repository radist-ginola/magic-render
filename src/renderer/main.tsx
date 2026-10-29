import type { JSX } from 'react';
import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import './styles/design-tokens.css';
import './styles/ui-primitives.css';

type FatalBootProps = { error: unknown };

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { error: unknown };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorStack(error: unknown): string {
  return error instanceof Error && error.stack ? error.stack : String(error);
}

function FatalBootScreen({ error }: FatalBootProps): JSX.Element {
  const message = errorMessage(error);
  const stack = errorStack(error);
  return (
    <main style={{ minHeight: '100vh', background: '#060611', color: '#f5f7ff', padding: 32, fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}>
      <section style={{ maxWidth: 980, margin: '0 auto', border: '1px solid rgba(255,56,209,.35)', borderRadius: 16, padding: 24, background: 'rgba(13,13,26,.92)', boxShadow: '0 0 24px rgba(255,56,209,.12)' }}>
        <div style={{ color: '#ff38d1', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Magic Render Pro / Renderer Startup Failure</div>
        <h1 style={{ margin: '10px 0', fontSize: 24 }}>Renderer gagal memuat UI</h1>
        <p style={{ color: 'rgba(245,247,255,.65)', lineHeight: 1.6 }}>Aplikasi berhasil membuka window, tetapi JavaScript renderer gagal dijalankan. Detail error ditampilkan di bawah agar tidak menjadi blank screen.</p>
        <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: '#05050d', border: '1px solid rgba(255,255,255,.08)', color: '#2cf9ff', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message}</div>
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', color: '#9b5cff' }}>Stack trace</summary>
          <pre style={{ marginTop: 10, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'rgba(245,247,255,.55)' }}>{stack}</pre>
        </details>
      </section>
    </main>
  );
}

class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('React renderer error.', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) return <FatalBootScreen error={this.state.error} />;
    return this.props.children;
  }
}

function showBootstrapFailure(error: unknown): void {
  const root = document.getElementById('root');
  if (!root) return;
  root.replaceChildren();
  const node = document.createElement('div');
  node.style.minHeight = '100vh';
  root.appendChild(node);
  createRoot(node).render(<FatalBootScreen error={error} />);
}

window.addEventListener('error', (event) => {
  console.error('Unhandled renderer error.', event.error ?? event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled renderer promise rejection.', event.reason);
});

void import('./App')
  .then(({ App }) => {
    const rootElement = document.getElementById('root');
    if (!rootElement) throw new Error('Renderer root element #root tidak ditemukan.');
    createRoot(rootElement).render(
      <React.StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </React.StrictMode>,
    );
  })
  .catch(showBootstrapFailure);
