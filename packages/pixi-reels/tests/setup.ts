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

// pixi-silk (the `pixi-reels/debug` subpath) compiles its shader when a
// SilkGraphics is constructed, and pixi's GlProgram probes the highest
// fragment precision through a throwaway WebGL context from
// `DOMAdapter.createCanvas()` - which is `document.createElement` and throws
// in Node. Hand it a canvas that has no WebGL: the probe then settles on
// 'mediump' and moves on, which is all a headless test needs. Imported
// dynamically so pixi.js loads after the navigator stub above.
const { DOMAdapter, BrowserAdapter } = await import('pixi.js');
DOMAdapter.set({
  ...BrowserAdapter,
  createCanvas: (width?: number, height?: number) =>
    ({ width: width ?? 0, height: height ?? 0, getContext: () => null }) as unknown as HTMLCanvasElement,
});
