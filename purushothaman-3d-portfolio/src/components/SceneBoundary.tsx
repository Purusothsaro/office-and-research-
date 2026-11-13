import { Component, type ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  children: ReactNode;
  onError?: () => void;
}
interface State {
  failed: boolean;
}

/** Swaps a WebGL scene for its fallback if the scene throws (context creation failure, shader error, etc.). */
export class SceneBoundary extends Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError?.();
    if (import.meta.env.DEV) console.warn('[3D] scene disabled, using fallback:', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
