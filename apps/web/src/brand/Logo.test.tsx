import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Logo } from "./Logo";
import { LogoMark } from "./LogoMark";

afterEach(cleanup);

describe.each([
  ["LogoMark", LogoMark],
  ["Logo", Logo],
] as const)("%s", (_name, Component) => {
  it("is an image named Nodal", () => {
    render(<Component />);
    expect(screen.getByRole("img", { name: "Nodal" })).toBeTruthy();
  });

  it("takes its gradient stops from the two brand tokens", () => {
    const { container } = render(<Component />);
    const stops = [...container.querySelectorAll("linearGradient stop")].map((s) =>
      s.getAttribute("stop-color"),
    );
    expect(stops).toEqual(["var(--color-brand-1)", "var(--color-brand-2)"]);
    const id = container.querySelector("linearGradient")?.id ?? "";
    expect(id).not.toBe("");
    expect(container.innerHTML).toContain(`url(#${id})`);
  });

  it("gets its own gradient id per instance", () => {
    const { container } = render(
      <>
        <Component />
        <Component />
      </>,
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("can be hidden from assistive technology", () => {
    render(<Component decorative />);
    expect(screen.queryByRole("img", { name: "Nodal" })).toBeNull();
  });
});
