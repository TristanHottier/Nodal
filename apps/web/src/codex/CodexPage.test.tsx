import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorStore } from "../editor/store";
import { CODEX } from "./catalog";
import CodexPage from "./CodexPage";

vi.mock("./entries", () => ({
  loadEntry: () => Promise.resolve({ html: "<p>Body text.</p>", title: "x" }),
}));

afterEach(cleanup);

const page = (id: string | null) => render(<CodexPage id={id} store={createEditorStore()} />);

describe("CodexPage", () => {
  it("lists every entry as a link, grouped by kind", () => {
    page(null);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const heading of ["Parts", "Analyses", "Concepts"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    }
    const links = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("href")?.startsWith("#/codex/"));
    expect(links).toHaveLength(CODEX.length);
    expect(screen.getByRole("link", { name: "Diode" }).getAttribute("href")).toBe("#/codex/diode");
  });

  it("offers a way back to the editor", () => {
    page(null);
    expect(screen.getByRole("link", { name: "Back to editor" }).getAttribute("href")).toBe("#/");
  });

  it("searches with a labelled search box and lists results as links", () => {
    page(null);
    const box = screen.getByRole("searchbox", { name: "Search the codex" });
    fireEvent.change(box, { target: { value: "Résistance" } });
    const results = within(screen.getByRole("list", { name: "Search results" }));
    expect(results.getByRole("link", { name: "Resistor" }).getAttribute("href")).toBe(
      "#/codex/resistor",
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("says when nothing matches", () => {
    page(null);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzqqq" } });
    expect(screen.getByRole("status").textContent).toMatch(/No entry matches/);
  });

  it("renders one entry with one h1 and sets the title", async () => {
    page("diode");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Diode");
    expect(await screen.findByText("Body text.")).toBeTruthy();
    expect(document.title).toBe("Diode · Codex · Nodal");
  });

  it("names an unknown entry and links to the index", () => {
    page("no-such-thing");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "No entry called no-such-thing",
    );
    expect(screen.getByRole("link", { name: "Back to the codex index" }).getAttribute("href")).toBe(
      "#/codex",
    );
  });

  it("titles the index", () => {
    page(null);
    expect(document.title).toBe("Codex · Nodal");
  });
});
