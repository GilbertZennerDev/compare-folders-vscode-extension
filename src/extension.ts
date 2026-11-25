import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { compareFolders } from "./compare";

async function pickFolder(title: string): Promise<string | undefined> {
  const r = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    title,
    openLabel: "Select",
  });
  return r?.[0].fsPath;
}

interface Row {
  label: string;
  description?: string;
  kind?: "diff" | "open";
  a?: string;
  b?: string;
}

export function activate(context: vscode.ExtensionContext) {
  const cmd = vscode.commands.registerCommand("compareFolders.compare", async () => {
    const a = await pickFolder("Compare Folders: pick the FIRST folder");
    if (!a) return;
    const b = await pickFolder("Compare Folders: pick the SECOND folder");
    if (!b) return;
    if (path.resolve(a) === path.resolve(b)) {
      vscode.window.showErrorMessage("Pick two different folders.");
      return;
    }

    const res = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Comparing folders ..." },
      () => compareFolders(a, b)
    );

    const total = res.onlyA.length + res.onlyB.length + res.different.length + res.unreadable.length;
    if (total === 0) {
      vscode.window.showInformationMessage(`The folders are identical (${res.same} files compared byte by byte).`);
      return;
    }

    const sep = (label: string): vscode.QuickPickItem => ({ label, kind: vscode.QuickPickItemKind.Separator });
    const items: (Row | vscode.QuickPickItem)[] = [];
    if (res.different.length) {
      items.push(sep(`Different (${res.different.length})`));
      for (const f of res.different) {
        const bothFiles = fs.existsSync(path.join(a, f)) && fs.statSync(path.join(a, f)).isFile() && fs.statSync(path.join(b, f)).isFile();
        items.push({ label: f, description: bothFiles ? "click to open the diff" : "file on one side, folder on the other", kind: bothFiles ? "diff" : undefined, a: path.join(a, f), b: path.join(b, f) } as Row);
      }
    }
    if (res.onlyA.length) {
      items.push(sep(`Only in the first folder (${res.onlyA.length})`));
      for (const f of res.onlyA) items.push({ label: f, description: "click to open", kind: "open", a: path.join(a, f) } as Row);
    }
    if (res.onlyB.length) {
      items.push(sep(`Only in the second folder (${res.onlyB.length})`));
      for (const f of res.onlyB) items.push({ label: f, description: "click to open", kind: "open", a: path.join(b, f) } as Row);
    }
    if (res.unreadable.length) {
      items.push(sep(`Could not be read (${res.unreadable.length})`));
      for (const f of res.unreadable) items.push({ label: f, description: "no permission or in use" });
    }

    const pick = (await vscode.window.showQuickPick(items as vscode.QuickPickItem[], {
      title: `${total} difference(s), ${res.same} identical file(s). Nothing is changed.`,
      placeHolder: "Pick an entry to open it",
      matchOnDescription: false,
    })) as Row | undefined;
    if (!pick) return;
    if (pick.kind === "diff" && pick.a && pick.b) {
      await vscode.commands.executeCommand("vscode.diff", vscode.Uri.file(pick.a), vscode.Uri.file(pick.b), `${pick.label} (first <-> second)`);
    } else if (pick.kind === "open" && pick.a) {
      await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(pick.a));
    }
  });
  context.subscriptions.push(cmd);
}

export function deactivate() {}
