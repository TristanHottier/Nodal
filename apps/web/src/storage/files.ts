// Reading and writing `.nodal.json` project files in the browser.
import { parseProject, type Project, serializeProject } from "@nodal/schema";

export type ReadResult = { ok: true; project: Project } | { ok: false; error: string };

function blobText(file: Blob): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("could not read file"));
    };
    reader.readAsText(file);
  });
}

/** Decode and validate a project file. Never throws. */
export async function readProjectFile(file: Blob): Promise<ReadResult> {
  let text: string;
  try {
    text = await blobText(file);
  } catch (e) {
    return {
      ok: false,
      error: `could not read file: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  return parseProject(raw);
}

export function projectFileName(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9 _-]/g, "_").trim();
  return `${safe === "" ? "untitled" : safe}.nodal.json`;
}

/** Offer the project as a download through a temporary link. */
export function downloadProject(p: Project, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([serializeProject(p)], { type: "application/json" }));
  const a = doc.createElement("a");
  a.href = url;
  a.download = projectFileName(p.name);
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
