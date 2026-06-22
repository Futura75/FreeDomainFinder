import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock SweetAlert2 so the helpers can be exercised without a real DOM dialog.
// mixin() returns its own `fire` (used by toast); Swal.fire is used by
// popup/confirm — kept distinct so assertions don't conflate the two paths.
vi.mock("sweetalert2", () => {
  const fire = vi.fn();
  const mixinFire = vi.fn();
  return {
    default: {
      fire,
      mixin: vi.fn(() => ({ fire: mixinFire })),
      stopTimer: vi.fn(),
      resumeTimer: vi.fn(),
    },
  };
});

import Swal from "sweetalert2";
import { setNotifyTheme, toast, popup, confirm } from "./notify";

const fire = vi.mocked(Swal.fire);
const mixin = vi.mocked(Swal.mixin);

beforeEach(() => {
  vi.clearAllMocks();
  setNotifyTheme(false);
});

describe("toast", () => {
  it("configures a top-end auto-dismiss toast and fires it themed", () => {
    toast("success", "Fatto", { timer: 1000 });
    const cfg = mixin.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(cfg).toMatchObject({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 1000,
    });
    const inst = mixin.mock.results.at(-1)!.value as { fire: ReturnType<typeof vi.fn> };
    expect(inst.fire).toHaveBeenCalledWith(
      expect.objectContaining({ icon: "success", title: "Fatto" })
    );
  });

  it("defaults the timer to 3500ms", () => {
    toast("info", "x");
    expect((mixin.mock.calls.at(-1)![0] as { timer: number }).timer).toBe(3500);
  });

  it("didOpen wires hover pause/resume listeners", () => {
    toast("info", "x");
    const cfg = mixin.mock.calls.at(-1)![0] as { didOpen: (el: unknown) => void };
    const el = { addEventListener: vi.fn() };
    cfg.didOpen(el);
    expect(el.addEventListener).toHaveBeenCalledTimes(2);
    expect(el.addEventListener).toHaveBeenCalledWith("mouseenter", expect.any(Function));
    expect(el.addEventListener).toHaveBeenCalledWith("mouseleave", expect.any(Function));
  });
});

describe("popup", () => {
  it("fires a centered dialog with a default OK button", () => {
    popup("warning", "Titolo", "testo");
    expect(fire).toHaveBeenCalledWith(
      expect.objectContaining({
        icon: "warning",
        title: "Titolo",
        text: "testo",
        confirmButtonText: "OK",
      })
    );
  });

  it("honors a custom confirm label", () => {
    popup("error", "T", undefined, { confirmText: "Chiudi" });
    expect(
      (fire.mock.calls.at(-1)![0] as unknown as { confirmButtonText: string }).confirmButtonText
    ).toBe("Chiudi");
  });
});

describe("confirm", () => {
  it("resolves to the isConfirmed flag", async () => {
    fire.mockResolvedValueOnce({ isConfirmed: true } as never);
    await expect(confirm("T", "msg")).resolves.toBe(true);
    fire.mockResolvedValueOnce({ isConfirmed: false } as never);
    await expect(confirm("T", "msg")).resolves.toBe(false);
  });

  it("uses the danger confirm color and custom labels when danger is set", async () => {
    fire.mockResolvedValueOnce({ isConfirmed: true } as never);
    await confirm("T", "msg", { danger: true, confirmText: "Sì", cancelText: "No" });
    expect(fire.mock.calls.at(-1)![0]).toMatchObject({
      confirmButtonColor: "#EA5455",
      confirmButtonText: "Sì",
      cancelButtonText: "No",
      showCancelButton: true,
    });
  });
});

describe("setNotifyTheme", () => {
  it("switches the themed palette between dark and light", () => {
    setNotifyTheme(true);
    popup("info", "dark");
    expect(
      (fire.mock.calls.at(-1)![0] as unknown as { background: string }).background
    ).toBe("#2F3349");
    setNotifyTheme(false);
    popup("info", "light");
    expect(
      (fire.mock.calls.at(-1)![0] as unknown as { background: string }).background
    ).toBe("#FFFFFF");
  });
});
