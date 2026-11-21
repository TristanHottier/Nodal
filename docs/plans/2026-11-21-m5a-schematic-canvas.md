# M5a Schematic Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web app at `/Nodal/` is a schematic editor: an SVG canvas with grid, zoom and pan where every v1 device, ground and net label can be placed, selected, moved, rotated, mirrored, copied, pasted and deleted, wired with orthogonal wires that show junction dots, with undo and redo for every edit.

**Architecture:** The schematic document (parts, wires, labels, all on integer grid coordinates) is a Zod schema in `packages/schema`, so M5b can wrap it in the `.nodal.json` project file without changing it. Every edit is a pure function `(doc, …) => doc` in `apps/web/src/editor/model/`, written with Immer and unit-tested without a browser. A Zustand store holds the document, snapshot history (ADR 0005), selection, clipboard, tool and view; React components only read the store and call edits. Symbols are one file each under `apps/web/src/symbols/` (geometry, pins, SVG body), drawn in grid units (ADR 0007). Junction dots come from one pure function that M5b's netlister will share the connection rule with.

**Tech Stack:** TypeScript 6 (strict), React 19, Vite 8, Vitest 5 + Testing Library + jsdom, Playwright; new runtime deps `zustand` and `immer` (ADR 0005). Zod 4 in `packages/schema`.

**Spec:** [`docs/ROADMAP.md`](../ROADMAP.md) §M5a; [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §2, §6.1, §6.3, §7; ADRs [0005](../adr/0005-frontend-stack.md), [0006](../adr/0006-svg-schematic-editor.md), [0007](../adr/0007-iec-symbols-drawn-from-scratch.md); the M5 scope note in the project's session notes (M5a = canvas, symbols, wires, junction dots, undo/redo; inspector, netlister, autosave and import/export are M5b).

## Global Constraints

- Everything in `AGENTS.md` and in earlier plans' Global Constraints still applies: English, commit identity `TristanHottier <185231225+TristanHottier@users.noreply.github.com>` with no AI trailers, Conventional Commits on `main`, humanizer on prose, never `minimumReleaseAgeExclude`, pin dependency versions old enough to pass pnpm's release-age gate.
- No engine, IR or golden changes. `irVersion` stays 1. `getEngineVersion` and the `engine-status` element stay (the M0 e2e tests keep passing).
- TypeScript `strict`, no `any`. Components under ~400 lines. Symbols one per file, IEC 60617 style, drawn from scratch.
- Grid unit = 10 px at zoom 1. All stored coordinates are integers in grid units. Zoom is clamped to [0.25, 8]; one wheel notch multiplies or divides it by 1.1, about the cursor.
- Transform of a symbol-local point `p` for a part at `(x, y)`: mirror first (`mirror: true` maps `(px, py) → (−px, py)`), then rotate clockwise on screen (`90: (px, py) → (−py, px)`, `180: → (−px, −py)`, `270: → (py, −px)`), then translate by `(x, y)`.
- History: one snapshot per committed edit, capped at 500; an edit that returns the same document (`===`) creates no entry. Selection, tool, view and clipboard are not in history.
- Out of scope (M5b or later): parameter inspector and value parsing, editing label text or part names, netlister and net naming, IndexedDB autosave, `.nodal.json` import/export and `formatVersion`, the 500-part frame-rate budget (M7), system clipboard.

## Review Focus

1. **A wire ending on another wire's corner vertex** (an L-shaped wire with a third wire ending at its bend). Expected: one junction dot at the bend. Pinned by `dot_at_corner_with_third_wire` (Task 5).
2. **Rotating or mirroring a part with wires on its pins.** Expected: wire ends follow the pins and every wire stays orthogonal (an extra bend is added, never a diagonal). Pinned by `rotate_keeps_wires_orthogonal` (Task 4).
3. **A drag that ends where it started, or Esc during a drag.** Expected: no history entry; undo then undoes the edit before. Pinned by `zero_drag_adds_no_history` and `escape_cancels_drag` (Task 7).
4. **Paste after the copied originals were deleted, and repeated paste.** Expected: paste still works, gets fresh ids and names (R3, R4…), and each further paste is offset by another (2, 2). Pinned by `paste_after_delete` and `repeated_paste_offsets` (Task 4).
5. **Clicking at extreme zoom (0.25 and 8) after a pan.** Expected: the item lands on the grid point under the cursor. Pinned by `screen_to_grid_at_zoom_extremes` (Task 7).

---

### Task 1: Schematic document schema and editor dependencies

**Files:** Create `packages/schema/src/schematic.ts`, `packages/schema/src/schematic.test.ts`. Modify `packages/schema/src/index.ts`, `apps/web/package.json`, `pnpm-lock.yaml`.

**Interfaces:**
- Produces (exported from `@nodal/schema`):
  - `PART_TYPES = ["resistor","capacitor","inductor","vsource","isource","vcvs","vccs","ccvs","cccs","diode","npn","pnp","nmos","pmos","switch","opamp","ground"] as const`; `type PartType`.
  - `type Point = { x: number; y: number }` (integers); `type Rotation = 0 | 90 | 180 | 270`.
  - `type Part = { id: string; type: PartType; name: string; x: number; y: number; rotation: Rotation; mirror: boolean; params: Record<string, string> }`.
  - `type Wire = { id: string; points: Point[] }`; `type NetLabel = { id: string; text: string; x: number; y: number; rotation: Rotation }`.
  - `type Schematic = { parts: Part[]; wires: Wire[]; labels: NetLabel[] }`; `schematicSchema` (Zod, `strictObject` throughout); `EMPTY_SCHEMATIC`.
  - `params` holds raw strings; M5b parses them (ADR 0009).
- Schema rules: coordinates are safe integers; `id` non-empty and unique across parts, wires and labels; a wire has ≥ 2 points, consecutive points differ and share `x` or `y`; `text` and `name` non-empty.

- [ ] **Step 1:** Write `schematic.test.ts`: `accepts_valid_schematic` (one part of each type, one L-shaped wire, one label); `rejects_diagonal_segment`; `rejects_single_point_wire`; `rejects_repeated_point`; `rejects_fractional_coordinate`; `rejects_duplicate_id_across_kinds` (part and wire share an id); `rejects_unknown_part_type`; `rejects_rotation_45`; `rejects_extra_field`. Each rejection asserts the Zod issue path.
- [ ] **Step 2:** `pnpm --filter @nodal/schema test`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the schema. Add `zustand` and `immer` to `apps/web` dependencies with `pnpm --filter @nodal/web add zustand immer` (latest versions the release-age gate accepts; caret ranges like the existing deps).
- [ ] **Step 4:** `pnpm install --frozen-lockfile && pnpm --filter @nodal/schema test && pnpm typecheck && pnpm lint && pnpm format:check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(schema): schematic document schema`.

### Task 2: Geometry, symbol interface and two-terminal symbols

**Files:** Create `apps/web/src/editor/geometry.ts`, `geometry.test.ts`; `apps/web/src/symbols/types.ts`, `catalog.ts`, `symbols.test.tsx`, and one file each: `resistor.tsx`, `capacitor.tsx`, `inductor.tsx`, `vsource.tsx`, `isource.tsx`, `vcvs.tsx`, `vccs.tsx`, `ccvs.tsx`, `cccs.tsx`, `ground.tsx`, `netLabel.tsx`.

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  - `geometry.ts`: `GRID = 10`; `transformPoint(p: Point, rotation: Rotation, mirror: boolean): Point` (Global Constraints convention); `pinPositions(part: Part): { name: string; at: Point }[]` (world grid coordinates, catalog order); `partBounds(part: Part): { x0: number; y0: number; x1: number; y1: number }`; `rotateCw(r: Rotation): Rotation`.
  - `symbols/types.ts`: `interface SymbolDef { type: PartType; label: string; prefix: string; pins: readonly { name: string; x: number; y: number }[]; bounds: { x0; y0; x1; y1 }; defaultParams: Readonly<Record<string, string>>; Body: () => JSX.Element }`. `Body` draws in grid units (the caller scales by `GRID`), strokes use `vector-effect="non-scaling-stroke"` and `currentColor`.
  - `catalog.ts`: `SYMBOLS: Record<PartType, SymbolDef>`; `PALETTE: readonly (PartType | "label")[]` in `PART_TYPES` order then `"label"`; `LABEL_SYMBOL: Pick<SymbolDef, "label" | "pins" | "bounds" | "Body">` (anchor pin at (0, 0)). Task 3 adds its symbols to `SYMBOLS`; until then `catalog.ts` may cover only this task's types if its type says `Partial`, and Task 3 makes it total.
- Pins (local grid units; names follow IR node order):

| Type | Prefix | Pins | defaultParams |
|---|---|---|---|
| resistor | R | `1` (0,−3), `2` (0,3) | `value: "1k"` |
| capacitor | C | `1` (0,−3), `2` (0,3) | `value: "1u"` |
| inductor | L | `1` (0,−3), `2` (0,3) | `value: "1m"` |
| vsource | V | `p` (0,−3), `n` (0,3) | `dc: "5"` |
| isource | I | `p` (0,−3), `n` (0,3) | `dc: "1m"` |
| vcvs, vccs | E, G | `p` (0,−3), `n` (0,3), `cp` (−4,−2), `cn` (−4,2) | `gain: "1"` |
| ccvs, cccs | H, F | `p` (0,−3), `n` (0,3) | `gain: "1", controlSource: ""` |
| ground | GND | `gnd` (0,0) | — |

- IEC drawings: resistor = rectangle 1 × 4 between the leads; capacitor = two plates; inductor = four semicircular humps (IEC 60617-04-03-01); vsource = circle with a line through it along the lead axis, `+` near `p`; isource = circle with a line across it perpendicular to the leads, arrow from `p` to `n`; vcvs/ccvs = diamond with `+`/`−`; vccs/cccs = diamond with arrow; control pins drawn as short leads with `+` at `cp`; ground = three horizontal lines of decreasing width below the pin; net label = text on a flag whose point sits on the anchor.

- [ ] **Step 1:** Write tests. `geometry.test.ts`: `transform_rotations` (point (1,0) maps to (0,1), (−1,0), (0,−1) for 90/180/270), `mirror_then_rotate` ((1,2), mirror, 90 → (−2,−1)), `four_rotations_identity` (every pin of every symbol), `pin_positions_world` (resistor at (5,7) rotation 90 → pins (8,7), (2,7)). `symbols.test.tsx`, for each symbol in the catalog: `pins_on_integer_grid`, `pin_names_unique`, `pins_inside_bounds` (pins may sit on the edge), `prefix_matches_table`, `body_renders` (renders inside an `<svg>` without throwing and draws at least one element).
- [ ] **Step 2:** `pnpm --filter @nodal/web test`. Expected: FAIL.
- [ ] **Step 3:** Implement geometry and the eleven symbols.
- [ ] **Step 4:** `pnpm --filter @nodal/web test && pnpm typecheck && pnpm lint && pnpm format:check`. Expected: PASS.
- [ ] **Step 5:** Render every symbol at zoom 2 into a throwaway HTML page or a Playwright screenshot and look at it (IEC shape, pins at the lead ends). Not committed.
- [ ] **Step 6:** Commit `feat(web): grid geometry and two-terminal IEC symbols`.

### Task 3: Semiconductor, switch and op-amp symbols

**Files:** Create `apps/web/src/symbols/{diode,npn,pnp,nmos,pmos,switch,opamp}.tsx`. Modify `catalog.ts` (now total over `PartType`), `symbols.test.tsx`.

**Interfaces:**
- Consumes: Task 2 `SymbolDef`, tests.
- Pins:

| Type | Prefix | Pins | defaultParams |
|---|---|---|---|
| diode | D | `a` (0,−3), `k` (0,3) | `model: ""` |
| npn, pnp | Q | `c` (2,−3), `b` (−3,0), `e` (2,3) | `model: ""` |
| nmos, pmos | M | `d` (2,−3), `g` (−3,0), `s` (2,3), `b` (4,0) | `model: "", w: "", l: ""` |
| switch | S | `p` (0,−3), `n` (0,3), `cp` (−4,−2), `cn` (−4,2) | `model: ""` |
| opamp | U | `inn` (−4,−2), `inp` (−4,2), `out` (4,0) | — |

- Drawings: diode = triangle pointing from `a` to `k` with a bar; BJT = base bar, collector and emitter lines, emitter arrow out (NPN) or in (PNP), optional envelope circle; MOSFET = enhancement type with three channel segments, gate plate, bulk arrow into the channel (NMOS) or out (PMOS); switch = make contact (IEC 60617-07-02-01) with a dashed coupling line to a control rectangle between `cp` and `cn`; op-amp = triangle with `−` at `inn`, `+` at `inp`, `∞` inside. The op-amp is ideal and has no supply pins; M5b's netlister decides its IR form.

- [ ] **Step 1:** Extend `symbols.test.tsx` with `catalog_covers_all_part_types` (`Object.keys(SYMBOLS)` equals `PART_TYPES`) and `palette_order` (`PALETTE` equals `[...PART_TYPES, "label"]`). The per-symbol tests from Task 2 now run over all seventeen.
- [ ] **Step 2:** `pnpm --filter @nodal/web test`. Expected: FAIL.
- [ ] **Step 3:** Implement the seven symbols.
- [ ] **Step 4:** Same verification as Task 2 Step 4, plus the visual check of Task 2 Step 5 for the new symbols.
- [ ] **Step 5:** Commit `feat(web): semiconductor, switch and op-amp symbols`.

### Task 4: Pure edit operations

**Files:** Create `apps/web/src/editor/model/{edits,wires,naming}.ts` and `edits.test.ts`, `wires.test.ts`, `naming.test.ts`.

**Interfaces:**
- Consumes: Tasks 1–3 (`Schematic`, `pinPositions`, `SYMBOLS`).
- Produces (all pure; return the input object unchanged, `===`, when nothing changes):
  - `naming.ts`: `nextName(doc: Schematic, prefix: string): string` (prefix + (largest numeric suffix among parts with that prefix, case-insensitive) + 1; `R1` when none); `nextLabelText(doc): string` (`NET1`, `NET2`…).
  - `wires.ts`: `normalizeWire(points: Point[]): Point[] | null` (drops repeated points and collinear middle points; `null` if fewer than two points remain); `followEnd(points, end: "start" | "end", to: Point): Point[]` (moves that end; if the end segment was horizontal it becomes `N → (to.x, N.y) → to`, if vertical `N → (N.x, to.y) → to`, then normalized).
  - `edits.ts`:
    - `addPart(doc, id: string, type: PartType, at: Point, rotation: Rotation, mirror: boolean): Schematic` (name from `nextName`, params from `defaultParams`).
    - `addLabel(doc, id, at: Point, rotation): Schematic`; `addWire(doc, id, points: Point[]): Schematic` (normalized; no-op if `null`).
    - `moveItems(doc, ids: readonly string[], delta: Point): Schematic`: moves selected parts, labels and wires; for each unselected wire, an end that sat on a pin of a moved part or on a moved label's anchor follows it with `followEnd`; if both ends follow by the same delta the whole wire translates.
    - `rotateItems(doc, ids)` (each selected part and label rotates 90° clockwise about its own origin) and `mirrorItems(doc, ids)` (toggles `mirror` on selected parts; labels unchanged). Wire ends on affected pins follow as in `moveItems`, each pin with its own displacement.
    - `deleteItems(doc, ids): Schematic` (wires attached to deleted parts stay).
    - `type Clip = { parts: Part[]; wires: Wire[]; labels: NetLabel[] }`; `copyItems(doc, ids): Clip | null`; `pasteClip(doc, clip, newId: () => string, offset: Point): { doc: Schematic; ids: string[] }` (fresh ids, part names from `nextName` in clip order, label text kept, everything shifted by `offset`).

- [ ] **Step 1:** Write tests. `naming.test.ts`: `first_name_is_1`, `next_after_gap` (R1, R5 → R6), `case_insensitive`, `prefixes_independent` (Q for npn and pnp share a counter). `wires.test.ts`: `normalize_drops_duplicates_and_collinear`, `normalize_null_when_degenerate`, `follow_horizontal_end`, `follow_vertical_end`, `follow_back_onto_segment_collapses`. `edits.test.ts`: `add_part_uses_defaults`, `add_wire_normalizes`, `move_translates_selected`, `move_drags_attached_wire_end`, `move_translates_wire_when_both_ends_follow`, `move_leaves_unattached_wire`, `rotate_part_and_label`, `rotate_keeps_wires_orthogonal` (resistor with wires on both pins, rotate: every segment of every wire is axis-aligned and its ends sit on the new pins), `mirror_toggles`, `mirror_moves_wire_on_controlled_source_pins` (vcvs control pins swap sides), `delete_keeps_dangling_wires`, `copy_nothing_selected_is_null`, `paste_renames_and_offsets`, `paste_after_delete`, `repeated_paste_offsets` (offsets (2,2), (4,4) given by the caller; names R2, R3), `noop_returns_same_object` (move by (0,0), delete of unknown id).
- [ ] **Step 2:** `pnpm --filter @nodal/web test`. Expected: FAIL.
- [ ] **Step 3:** Implement with Immer `produce`.
- [ ] **Step 4:** `pnpm --filter @nodal/web test && pnpm typecheck && pnpm lint && pnpm format:check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): pure schematic edit operations`.

### Task 5: Junction dots

**Files:** Create `apps/web/src/editor/model/junctions.ts`, `junctions.test.ts`. Modify `docs/ARCHITECTURE.md` §6.1.

**Interfaces:**
- Consumes: `pinPositions` (Task 2).
- Produces: `junctionDots(doc: Schematic): Point[]`, sorted by `x` then `y`, no duplicates.
- Rule (ARCHITECTURE §6.1): for each point `P` that is a wire end or a pin, its degree is (wire ends at `P`) + (pins at `P`) + 2 × (wires passing through `P`, either strictly inside a segment or at an inner vertex). `P` gets a dot when its degree ≥ 3. A point where wires only cross (no end and no pin there) is never examined, so crossings get no dot. Label anchors do not count.

- [ ] **Step 1:** Write `junctions.test.ts`: `t_junction` (wire end on the inside of another wire → one dot), `plain_crossing_no_dot`, `corner_no_dot` (an L wire alone), `dot_at_corner_with_third_wire`, `two_ends_meeting_no_dot`, `three_ends_meeting_dot`, `pin_on_wire_interior_dot` (a resistor pin on the inside of a wire), `wire_end_on_pin_no_dot`, `four_way_one_dot` (two wires ending on the inside of a third from both sides at the same point), `label_does_not_count`.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement (index points in a `Map` keyed `"x,y"`; O(points × segments) is fine for v1).
- [ ] **Step 4:** `pnpm --filter @nodal/web test`. Expected: PASS.
- [ ] **Step 5:** Write the degree rule and the transform convention (Global Constraints) into ARCHITECTURE §6.1, run the humanizer on the changed prose, commit `feat(web): junction dots`.

### Task 6: Editor store with history

**Files:** Create `apps/web/src/editor/store.ts`, `store.test.ts`, `apps/web/src/editor/EditorContext.tsx`.

**Interfaces:**
- Consumes: Tasks 1, 4.
- Produces:
  - `type Tool = { kind: "select" } | { kind: "place"; item: PartType | "label"; rotation: Rotation; mirror: boolean } | { kind: "wire" }`.
  - `type View = { x: number; y: number; zoom: number }` (screen offset in px of grid origin, zoom factor).
  - `interface EditorState { doc; past: Schematic[]; future: Schematic[]; selection: readonly string[]; clipboard: Clip | null; pasteCount: number; tool: Tool; view: View; commit(next: Schematic, select?: readonly string[]): void; undo(): void; redo(): void; select(ids: readonly string[]): void; setTool(t: Tool): void; setView(v: View): void; copy(): void; paste(): void; newId(): string }`.
  - `createEditorStore(opts?: { doc?: Schematic; newId?: () => string }): StoreApi<EditorState>` (Zustand vanilla `createStore`; default `newId` is `crypto.randomUUID`).
  - `EditorProvider` and `useEditor<T>(selector: (s: EditorState) => T): T` in `EditorContext.tsx`.
- Behaviour: `commit` ignores `next === doc`; otherwise pushes the old doc on `past` (drop the oldest beyond 500), clears `future`, sets `selection` to `select` when given. `undo`/`redo` swap docs and drop selected ids that no longer exist. `copy` stores `copyItems(doc, selection)` and resets `pasteCount` to 0; `paste` increments `pasteCount` and pastes at offset `(2·pasteCount, 2·pasteCount)`, selecting the pasted items. `setView` clamps zoom to [0.25, 8].

- [ ] **Step 1:** Write `store.test.ts`: `commit_pushes_history`, `same_doc_no_history`, `undo_redo_roundtrip`, `new_commit_clears_future`, `history_capped_at_500`, `undo_prunes_selection`, `undo_on_empty_is_noop`, `copy_paste_selects_pasted`, `zoom_clamped`.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement. **Step 4:** `pnpm --filter @nodal/web test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): editor store with undo and redo`.

### Task 7: Canvas: view, rendering, selection and move

**Files:** Create `apps/web/src/editor/canvas/{Canvas,GridBackground,PartView,WireView,LabelView,JunctionDots,SelectionBox,coords}.tsx|ts`, `coords.test.ts`, `Canvas.test.tsx`, `apps/web/src/test/setup.ts` (only if jsdom lacks `PointerEvent`: a `MouseEvent` subclass with `pointerId`, registered in `vite.config.ts` `test.setupFiles`).

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces:
  - `coords.ts`: `screenToWorld(client: Point, rect: { left: number; top: number }, view: View): { x: number; y: number }` (unrounded grid units) and `snap(p): Point` (`Math.round` per axis); `zoomAt(view, client, rect, factor): View`.
  - `<Canvas />`: one `<svg data-testid="schematic-canvas">` filling its container; inner `<g transform="translate(view.x view.y) scale(view.zoom·GRID)">`. Renders grid dots, wires (`data-testid="wire-<id>"`, wide transparent hit stroke), parts (`data-testid="part-<id>"`, transparent bounds rect for hits, `data-selected`), labels (`label-<id>`), junction dots (`<circle data-testid="junction" data-x data-y>`), and the box-select rectangle. Selected items use a CSS class, not a different geometry.
  - Interaction in the select tool: pointer down on an item selects it (Shift toggles) and starts a drag; while dragging, the canvas renders `moveItems(doc, selection, snappedDelta)` as a preview; pointer up commits it once. Pointer down on empty canvas starts a box select (items whose bounds lie fully inside are selected; Shift adds). Middle button drag, or left drag with Space held, pans. Wheel zooms about the cursor. Esc during a drag or box select cancels it.

- [ ] **Step 1:** Write tests. `coords.test.ts`: `screen_to_grid_at_zoom_extremes` (zoom 0.25 and 8 with view offset (37, −53): the client point of grid (12, −4) maps back to it), `zoom_at_keeps_cursor_fixed`. `Canvas.test.tsx` (store seeded with a resistor R1 at (10,10) and a wire): `renders_parts_wires_dots`, `click_selects`, `shift_click_toggles`, `click_empty_clears`, `box_select`, `drag_moves_and_commits_once`, `zero_drag_adds_no_history`, `escape_cancels_drag`, `wheel_zooms_about_cursor`, `space_drag_pans`.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement. Keep `Canvas.tsx` under 400 lines by putting pointer handling in a `useCanvasPointer` hook file if needed. Memoize `PartView`/`WireView` on their item objects.
- [ ] **Step 4:** `pnpm --filter @nodal/web test && pnpm typecheck && pnpm lint && pnpm format:check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): schematic canvas with selection and move`.

### Task 8: Tools, palette and keyboard

**Files:** Create `apps/web/src/editor/Palette.tsx`, `apps/web/src/editor/tools/{place,wire}.ts(x)`, `apps/web/src/editor/useShortcuts.ts`, `apps/web/src/editor/Editor.tsx`, `Editor.test.tsx`, `wireTool.test.tsx`.

**Interfaces:**
- Consumes: Tasks 2–7.
- Produces:
  - `<Palette />`: one `<button aria-label="Place <SymbolDef.label>">` per `PALETTE` entry (net label: "Place net label") with a small symbol preview, plus `aria-label="Wire"` and `aria-label="Select"` tool buttons; the active tool has `aria-pressed="true"`.
  - Place tool: a ghost of the symbol follows the snapped cursor; click commits `addPart`/`addLabel` and selects the new item; the tool stays active for more placements. R and X rotate and mirror the ghost.
  - Wire tool: first click fixes the start; the preview runs from the last fixed point to the cursor horizontal-then-vertical (`/` toggles vertical-then-horizontal); a click adds both preview points; the wire is committed by a double click, by Enter, or by a click on a pin, wire end or wire segment other than the start; Esc discards the wire in progress (a second Esc returns to the select tool). The committed wire goes through `addWire`.
  - `useShortcuts()` (window `keydown`, ignored when the target is an `input`, `textarea` or `contenteditable`): `R` rotate, `X` mirror, `Delete`/`Backspace` delete, `Ctrl/Cmd+C` copy, `Ctrl/Cmd+V` paste, `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` and `Ctrl/Cmd+Y` redo, `W` wire tool, `Esc` cancel or back to select.
  - `<Editor />`: palette, canvas, and a bottom status bar holding the existing `engine-status` text.

- [ ] **Step 1:** Write tests. `Editor.test.tsx`: a table over all eighteen `PALETTE` entries, each running `place → move → rotate → mirror (parts only) → copy/paste → delete` through the UI (palette click, canvas click at grid (10,10), drag to (14,12), keys) and checking the store after each step; after each step `Ctrl+Z` restores the document before it and `Ctrl+Shift+Z` re-applies it (`toEqual` on `doc`). Plus `shortcuts_ignored_in_inputs` and `escape_returns_to_select`. `wireTool.test.tsx`: `draws_l_wire_between_two_pins` (two resistors; wire ends sit on the pins; two segments), `slash_toggles_bend`, `click_on_wire_interior_ends_wire_with_dot`, `escape_discards_wire`, `enter_commits_wire`, `wire_undo_redo`.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement. **Step 4:** `pnpm --filter @nodal/web test && pnpm typecheck && pnpm lint && pnpm format:check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): placement, wire tool and shortcuts`.

### Task 9: App integration, end-to-end test and close M5a

**Files:** Modify `apps/web/src/App.tsx`, `App.test.tsx`, `apps/web/index.html` (full-viewport layout CSS if needed), `docs/ARCHITECTURE.md` (§6.1 interaction summary and keymap; §8 e2e row), `docs/ROADMAP.md`, `README.md`. Create `apps/web/e2e/editor.spec.ts`.

**Interfaces:**
- Consumes: `<Editor />` (Task 8).
- Produces: `App` renders `<EditorProvider><Editor /></EditorProvider>`; `engine-status` keeps its three texts.

- [ ] **Step 1:** Write `e2e/editor.spec.ts` (Chromium and Firefox, against the production build under `/Nodal/`): `editor_draws_and_undoes` (place a resistor and a ground from the palette, wire the resistor's bottom pin to ground, expect one `wire-*` element; place a second wire ending on the first one's inside, expect one `junction`; `Ctrl+Z` removes it). Keep `App.test.tsx`'s three engine-status tests passing.
- [ ] **Step 2:** `pnpm --filter @nodal/web build && pnpm --filter @nodal/web e2e`. Expected: FAIL until App renders the editor, then PASS, including `shell.spec.ts`.
- [ ] **Step 3:** Update ARCHITECTURE §6.1 (interaction and keymap) and §8, README status ("M5a done: schematic editor without simulation; nothing is saved yet"), and ROADMAP M5a status with an Evidence line placeholder. Run the humanizer on the prose.
- [ ] **Step 4:** Full local check: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm --filter @nodal/web build && pnpm --filter @nodal/web e2e && cargo test --workspace`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): editor in the app shell`, push, wait for CI. Check that `https://tristanhottier.github.io/Nodal/` shows the palette and canvas.
- [ ] **Step 6:** Fill the ROADMAP Evidence line (CI run URL, the web job running the component tests, the deploy job), set M5a to **done**, update the session notes' Status section, commit `docs: close M5a`, push.
