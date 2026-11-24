import { Component, type ReactNode } from 'react'

// If the lazy graph chunk fails to load or the graph throws, show nothing: the text alert above it carries the
// finding. (Error boundaries have to be class components.)
export default class GraphBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.warn('Lost-link graph unavailable', error) }
  render() { return this.state.failed ? null : this.props.children }
}
