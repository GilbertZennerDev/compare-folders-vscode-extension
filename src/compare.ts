import * as fs from "fs/promises";
import * as path from "path";

export interface Result {
  onlyA: string[];
  onlyB: string[];
  different: string[];
  unreadable: string[];
  same: number;
}

const SKIP = new Set([".git", "node_modules"]);

type Kind = "file" | "dir" | "other";

async function listDir(dir: string): Promise<Map<string, Kind>> {
  const out = new Map<string, Kind>();
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    out.set(e.name, e.isDirectory() ? "dir" : e.isFile() ? "file" : "other");
  }
  return out;
}

export async function sameBytes(a: string, b: string): Promise<boolean> {
  const [sa, sb] = await Promise.all([fs.stat(a), fs.stat(b)]);
  if (sa.size !== sb.size) return false;
  const [fa, fb] = [await fs.open(a, "r"), await fs.open(b, "r")];
  try {
    const bufA = Buffer.alloc(64 * 1024);
    const bufB = Buffer.alloc(64 * 1024);
    for (;;) {
      const [ra, rb] = await Promise.all([fa.read(bufA, 0, bufA.length, null), fb.read(bufB, 0, bufB.length, null)]);
      if (ra.bytesRead !== rb.bytesRead) return false;
      if (ra.bytesRead === 0) return true;
      if (!bufA.subarray(0, ra.bytesRead).equals(bufB.subarray(0, rb.bytesRead))) return false;
    }
  } finally {
    await fa.close();
    await fb.close();
  }
}

export async function compareFolders(rootA: string, rootB: string): Promise<Result> {
  const r: Result = { onlyA: [], onlyB: [], different: [], unreadable: [], same: 0 };

  async function collect(root: string, rel: string, into: string[]): Promise<void> {
    let entries: Map<string, Kind>;
    try {
      entries = await listDir(path.join(root, rel));
    } catch {
      r.unreadable.push(rel);
      return;
    }
    for (const [name, kind] of [...entries].sort()) {
      const sub = rel ? `${rel}/${name}` : name;
      if (kind === "dir") await collect(root, sub, into);
      else if (kind === "file") into.push(sub);
    }
  }

  async function walk(rel: string): Promise<void> {
    let a: Map<string, Kind>;
    let b: Map<string, Kind>;
    try {
      [a, b] = await Promise.all([listDir(path.join(rootA, rel)), listDir(path.join(rootB, rel))]);
    } catch {
      r.unreadable.push(rel || ".");
      return;
    }
    for (const name of [...new Set([...a.keys(), ...b.keys()])].sort()) {
      const sub = rel ? `${rel}/${name}` : name;
      const ka = a.get(name);
      const kb = b.get(name);
      if (ka === "other" || kb === "other") continue;
      if (ka && !kb) {
        if (ka === "dir") await collect(rootA, sub, r.onlyA);
        else r.onlyA.push(sub);
      } else if (kb && !ka) {
        if (kb === "dir") await collect(rootB, sub, r.onlyB);
        else r.onlyB.push(sub);
      } else if (ka !== kb) {
        r.different.push(sub);
      } else if (ka === "dir") {
        await walk(sub);
      } else {
        try {
          if (await sameBytes(path.join(rootA, sub), path.join(rootB, sub))) r.same++;
          else r.different.push(sub);
        } catch {
          r.unreadable.push(sub);
        }
      }
    }
  }

  await walk("");
  return r;
}
