import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-2xl border border-danger-200 bg-danger-50 p-4 text-center text-sm text-danger-700">
            Something went wrong loading this section.
          </div>
        )
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
