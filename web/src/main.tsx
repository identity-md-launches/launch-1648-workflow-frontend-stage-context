import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider } from "@tanstack/react-query";
import { loadDeployment } from "./config";
import { AppProvider } from "./state";
import { App } from "./App";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="boot-error">
        <h1>Unable to display this page.</h1>
        <p>No transaction will be requested. Reload to retry.</p>
        <button className="button" onClick={() => location.reload()}>
          Reload
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
loadDeployment()
  .then((runtime) =>
    root.render(
      <ErrorBoundary>
        <WagmiProvider config={runtime.walletConfig}>
          <QueryClientProvider client={runtime.queryClient}>
            <AppProvider runtime={runtime}>
              <App />
            </AppProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </ErrorBoundary>,
    ),
  )
  .catch((error) =>
    root.render(
      <main className="boot-error">
        <h1>Deployment unavailable.</h1>
        <p role="alert">
          {error instanceof Error
            ? error.message
            : "Reload this page to retry."}
        </p>
        <button className="button" onClick={() => location.reload()}>
          Reload
        </button>
      </main>,
    ),
  );
