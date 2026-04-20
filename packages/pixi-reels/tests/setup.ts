// pixi.js@8 calls `isSafari()` at module-load time, which reads
// `navigator.userAgent`. Node < 21.1 has no global navigator, so any test
// that imports a module that pulls in pixi.js (transitively, via the
// ReelSymbol side of the testing harness) crashes with
// `ReferenceError: navigator is not defined`. Provide a minimal stub.
if (typeof (globalThis as { navigator?: unknown }).navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node' },
    configurable: true,
    writable: true,
  });
}
