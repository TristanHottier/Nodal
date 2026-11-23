import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Field } from "./Field";

afterEach(cleanup);

describe("Field", () => {
  it("unit_cells_share_one_grid_column", () => {
    render(
      <>
        <Field label="Resistance" value="1k" unit="Ω" onCommit={() => undefined} />
        <Field label="Cursor A" value="" unit="Hz" onCommit={() => undefined} />
      </>,
    );
    const units = [screen.getByText("Ω"), screen.getByText("Hz")];
    for (const u of units) {
      // The column comes from the shared class in Inspector.css, not from an inline style.
      expect(u.className).toBe("nodal-unit");
      expect(u.getAttribute("style")).toBeNull();
      expect(u.parentElement?.className).toContain("nodal-field");
    }
  });

  it("input_and_unit_are_siblings_of_the_label_in_one_grid", () => {
    render(<Field label="Resistance" value="1k" unit="Ω" onCommit={() => undefined} />);
    const input = screen.getByRole("textbox", { name: "Resistance" });
    expect(input.parentElement).toBe(screen.getByText("Ω").parentElement);
  });

  it("numeric_or_unit_marks_the_field_for_mono_figures", () => {
    const plain = render(<Field label="Name" value="x" onCommit={() => undefined} />);
    expect(plain.container.querySelector(".nodal-field")?.getAttribute("data-numeric")).toBeNull();
    plain.unmount();
    const numeric = render(<Field label="Gain" value="1" numeric onCommit={() => undefined} />);
    expect(numeric.container.querySelector(".nodal-field")?.getAttribute("data-numeric")).toBe(
      "true",
    );
    numeric.unmount();
    const unit = render(<Field label="R" value="1k" unit="Ω" onCommit={() => undefined} />);
    expect(unit.container.querySelector(".nodal-field")?.getAttribute("data-numeric")).toBe("true");
  });
});
