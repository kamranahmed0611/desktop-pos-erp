import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, ArrowRightLeft, Copy, Check, Terminal } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[POS ErrorBoundary] Caught exception:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReturnToGateway = () => {
    window.location.hash = '';
    window.location.reload();
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleCopyDiagnostic = () => {
    const text = `POINT OF SALE &amp; ERP ERROR REPORT
Date: ${new Date().toISOString()}
Error: ${this.state.error?.message || 'Unknown error'}
Stack:
${this.state.error?.stack || 'No stack trace'}

Component Stack:
${this.state.errorInfo?.componentStack || 'No component stack'}
`;
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#182327] text-stone-100 flex flex-col items-center justify-center p-4 sm:p-6 font-sans select-none antialiased">
          <div className="bg-[#243338] border-2 border-amber-600/50 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl flex flex-col items-center space-y-5 animate-fade-in">
            
            {/* ICON &amp; TITLE */}
            <div className="p-4 bg-amber-500/20 text-amber-400 rounded-3xl border border-amber-500/30">
              <AlertTriangle className="w-10 h-10 stroke-[2.5]" />
            </div>

            <div className="text-center space-y-1.5">
              <span className="text-[11px] font-mono font-bold text-amber-400 uppercase tracking-widest block">
                Point of Sale &amp; ERP • Recovery System
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Workstation Exception Recovered
              </h1>
              <p className="text-xs text-stone-300 max-w-md mx-auto leading-relaxed">
                The terminal encountered an unexpected rendering error. Your database and recorded sales remain completely secure in SQLite.
              </p>
            </div>

            {/* ERROR SUMMARY BOX */}
            <div className="w-full bg-stone-950/80 border border-stone-800 rounded-2xl p-3.5 text-xs font-mono space-y-1">
              <div className="flex items-center gap-1.5 text-red-400 font-bold">
                <Terminal className="w-3.5 h-3.5" />
                <span>{this.state.error?.name || 'Error'}:</span>
              </div>
              <p className="text-stone-300 break-words pl-5">
                {this.state.error?.message || 'An unknown render error occurred.'}
              </p>
            </div>

            {/* ACTION BUTTONS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full pt-1">
              <button
                type="button"
                onClick={this.handleReturnToGateway}
                className="py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black shadow-md cursor-pointer flex items-center justify-center gap-2 transition-all hover:scale-101"
              >
                <ArrowRightLeft className="w-4 h-4 stroke-[2.5]" />
                <span>Return to Station Gateway</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="py-3 px-4 bg-stone-700 hover:bg-stone-600 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center justify-center gap-2 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reload Terminal</span>
              </button>
            </div>

            {/* COPY DIAGNOSTICS */}
            <button
              type="button"
              onClick={this.handleCopyDiagnostic}
              className="text-[11px] text-stone-400 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {this.state.copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{this.state.copied ? 'Diagnostics Copied to Clipboard!' : 'Copy Diagnostics Report'}</span>
            </button>

          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
