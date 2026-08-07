// Error capture, wrapped AT MODULE LOAD.
//
// This module is imported first and does its work on import, not inside a start
// function. "The app failed to start" is exactly the case worth capturing, and a
// startup function may never run.

const MAX = 25;
export const captured = [];

function record(kind, detail) {
  if (captured.length >= MAX) return;
  captured.push({ kind, detail: String(detail).slice(0, 400), at: new Date().toISOString() });
}

const realError = console.error.bind(console);
console.error = (...args) => {
  record('console.error', args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : a)).join(' '));
  realError(...args);
};

addEventListener('error', (event) => {
  if (event.message) record('error', `${event.message} (${event.filename || 'unknown file'}:${event.lineno || 0})`);
});

addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  record('unhandled rejection', reason instanceof Error ? `${reason.name}: ${reason.message}` : reason);
});
