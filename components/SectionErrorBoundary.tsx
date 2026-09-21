"use client";
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Shown in place of the section if it fails. Defaults to nothing, so
   *  the rest of the page (nav, other sections) is completely unaffected. */
  fallback?: ReactNode;
  /** Label used in the console error, so a real failure is still easy to
   *  find and fix — it just no longer takes the whole page down with it. */
  name: string;
}

interface State {
  hasError: boolean;
}

/**
 * Wraps a single homepage section (video, 3D book, carousel, etc.). Without
 * this, a thrown error in ANY one of these during hydration on a full page
 * refresh silently aborts hydration for the entire page — including the
 * Nav bar, which is why "Home" would lose its active-page highlight (and
 * every other interactive bit) specifically on refresh, while simpler pages
 * like /about kept working fine.
 */
export default class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`Section "${this.props.name}" failed to render:`, error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
