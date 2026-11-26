import { cleanup, render, screen } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadBoundary } from "./LoadBoundary";

afterEach(cleanup);

const Broken = lazy(() => Promise.reject(new Error("chunk failed")));

function renderBroken(onError?: (e: unknown) => void, fallback?: string) {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  return render(
    <LoadBoundary {...(onError ? { onError } : {})} {...(fallback ? { fallback } : {})}>
      <Suspense fallback={<p>Loading…</p>}>
        <Broken />
      </Suspense>
    </LoadBoundary>,
  );
}

describe("LoadBoundary", () => {
  it("reports_a_failed_lazy_chunk_once_and_renders_the_fallback", async () => {
    const onError = vi.fn();
    renderBroken(onError, "gone");
    expect(await screen.findByText("gone")).toBeTruthy();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("renders_nothing_without_a_fallback", async () => {
    const { container } = renderBroken();
    await vi.waitFor(() => {
      expect(screen.queryByText("Loading…")).toBeNull();
    });
    expect(container.textContent).toBe("");
  });
});
