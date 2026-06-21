import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia; provide a minimal stub.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom doesn't implement scrollIntoView.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// CSS.escape is missing in jsdom.
if (typeof globalThis.CSS !== "undefined" && !("escape" in globalThis.CSS)) {
  // @ts-except-error - augmenting
  globalThis.CSS.escape = (value: string) => String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
