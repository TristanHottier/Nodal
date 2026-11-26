import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorStore } from "../editor/store";
import { EXAMPLES } from "../examples";
import { CODEX, entryForItem } from "./catalog";
import { CodexEntry } from "./CodexEntry";
import { modelRows } from "./paramTable";

const loadEntry = vi.hoisted(() => vi.fn());
vi.mock("./entries", () => ({ loadEntry }));

const HTML =
  '<h2 id="how">How it works</h2><p>Before the tables.</p><div data-codex-slot="parameters"></div><p>After the tables.</p>';

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  window.location.hash = "";
});

describe("CodexEntry", () => {
  it("renders the header, pins, tables, Try it and related links", async () => {
    loadEntry.mockResolvedValue({ html: HTML, title: "NPN transistor" });
    const meta = entryForItem("npn");
    render(<CodexEntry meta={meta} store={createEditorStore()} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(meta.title);
    expect(screen.getByText(/Also known as/).textContent).toContain("BJT");

    const symbol = screen.getByRole("img");
    expect(symbol.getAttribute("aria-label")).toMatch(/Pins: c, b, e/);

    expect(await screen.findByText("Before the tables.")).toBeTruthy();
    expect(screen.getByText("After the tables.")).toBeTruthy();

    const table = screen.getByRole("table", { name: /Model card/ });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(modelRows("NPN").length + 1);
    expect(within(table).getByText("BF")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Try it/ })).toBeTruthy();

    const related = within(screen.getByRole("navigation", { name: "Related entries" }));
    expect(related.getByRole("link", { name: "PNP transistor" }).getAttribute("href")).toBe(
      "#/codex/pnp",
    );
  });

  it("puts the parameter tables where the slot is", async () => {
    loadEntry.mockResolvedValue({ html: HTML, title: "x" });
    const { container } = render(
      <CodexEntry meta={entryForItem("npn")} store={createEditorStore()} />,
    );
    await screen.findByText("Before the tables.");
    const text = container.textContent;
    expect(text.indexOf("Before the tables.")).toBeLessThan(text.indexOf("Model card"));
    expect(text.indexOf("Model card")).toBeLessThan(text.indexOf("After the tables."));
  });

  it("shows inspector field rows for a part without a model card", async () => {
    loadEntry.mockResolvedValue({ html: HTML, title: "x" });
    render(<CodexEntry meta={entryForItem("resistor")} store={createEditorStore()} />);
    await screen.findByText("After the tables.");
    expect(screen.getByRole("table", { name: "Inspector fields" })).toBeTruthy();
    expect(screen.queryByRole("table", { name: /Model card/ })).toBeNull();
  });

  it("Try it loads the example into the store and returns to the editor", () => {
    loadEntry.mockResolvedValue({ html: HTML, title: "x" });
    const store = createEditorStore();
    const meta = CODEX.find((e) => e.id === "resistor");
    if (meta === undefined) throw new Error("no resistor entry");
    window.location.hash = "#/codex/resistor";
    render(<CodexEntry meta={meta} store={store} />);
    fireEvent.click(screen.getByRole("button", { name: /Try it/ }));
    expect(store.getState().doc.parts.length).toBeGreaterThan(0);
    expect(window.location.hash).toBe("#/");
  });

  it("Try it does nothing when the user cancels the replace confirm", () => {
    loadEntry.mockResolvedValue({ html: HTML, title: "x" });
    const store = createEditorStore();
    store.getState().setStatusMessage("keep");
    const before = store.getState().doc;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    // A non-empty project makes the replace check ask.
    const first = EXAMPLES[0];
    if (first === undefined) throw new Error("no examples");
    store.getState().loadProject(first.load());
    const loaded = store.getState().doc;
    window.location.hash = "#/codex/resistor";
    const meta = entryForItem("resistor");
    render(<CodexEntry meta={meta} store={store} />);
    fireEvent.click(screen.getByRole("button", { name: /Try it/ }));
    expect(confirm).toHaveBeenCalled();
    expect(window.location.hash).toBe("#/codex/resistor");
    expect(store.getState().doc).toBe(loaded);
    expect(before).not.toBe(loaded);
    confirm.mockRestore();
  });

  it("puts Try it after the prose and before the related links", async () => {
    loadEntry.mockResolvedValue({ html: HTML, title: "x" });
    render(<CodexEntry meta={entryForItem("npn")} store={createEditorStore()} />);
    const after = await screen.findByText("After the tables.");
    const button = screen.getByRole("button", { name: /Try it/ });
    const related = screen.getByRole("navigation", { name: "Related entries" });
    expect(after.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.compareDocumentPosition(related) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("has no Try it button and no symbol for a concept without an example", async () => {
    loadEntry.mockResolvedValue({ html: "<p>Prose.</p>", title: "x" });
    const meta = CODEX.find((e) => e.kind === "concept" && e.tryIt === undefined);
    if (meta === undefined) throw new Error("no such concept");
    render(<CodexEntry meta={meta} store={createEditorStore()} />);
    await screen.findByText("Prose.");
    expect(screen.queryByRole("button", { name: /Try it/ })).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("says so when the entry cannot be loaded", async () => {
    loadEntry.mockRejectedValue(new Error("boom"));
    render(<CodexEntry meta={entryForItem("diode")} store={createEditorStore()} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not be loaded/);
  });
});
