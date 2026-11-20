import { render } from 'preact';

// Placeholder shell. The real screens are built through Kiro specs 01 to 08.
function App() {
  return (
    <main style={{ background: '#0b0f0c', color: '#7CFF9E', minHeight: '100vh', padding: 24, fontFamily: 'ui-monospace, monospace' }}>
      <h1>WAIL</h1>
      <p>Environment works. Next: run the kill test at /spikes/kill-test.html</p>
    </main>
  );
}

render(<App />, document.getElementById('app')!);
