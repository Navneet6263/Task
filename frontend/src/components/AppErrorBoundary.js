import React from 'react';
export default class AppErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div role="alert" className="m-6 rounded-xl border bg-white p-6"><h1 className="text-xl font-bold">This screen could not load</h1><p className="my-3">Your saved data is unchanged. Reload to try again.</p><button className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={() => window.location.reload()}>Reload page</button></div>;
    return this.props.children;
  }
}
