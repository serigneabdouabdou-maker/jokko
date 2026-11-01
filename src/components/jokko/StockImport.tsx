import { useRef, useState } from "react";
import { Icon } from "./Icon";
import { Button } from "@/components/ui/button";
import { type Shop, money } from "@/model";
import { applyImport, type Cell, type ImportLine, parseRows, previewImport, templateCsv, textToRows } from "@/data/stockImport";

/** Lit un fichier Excel (.xlsx) ou CSV en tableau de cellules. */
async function readFile(file: File): Promise<Cell[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { default: readXlsxFile } = await import("read-excel-file");
    return (await readXlsxFile(file)) as Cell[][];
  }
  if (name.endsWith(".xls")) throw new Error("Ce fichier est un ancien format Excel (.xls). Dans Excel : Fichier → Enregistrer sous → « Classeur Excel (.xlsx) », puis réessaie.");
  return textToRows(await file.text());
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Ajouter plusieurs articles d'un coup : fichier Excel / CSV, ou liste collée.
 * Toujours un aperçu avant d'enregistrer.
 */
export function StockImport({ shop, commit }: { shop: Shop; commit: (s: Shop) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState<ImportLine[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [mode, setMode] = useState<"remplacer" | "ajouter">("remplacer");
  const [paste, setPaste] = useState<string | null>(null);
  const [done, setDone] = useState("");

  function show(rows: Cell[][]) {
    const parsed = parseRows(rows);
    setErrors(parsed.errors);
    setLines(parsed.items.length ? previewImport(shop, parsed.items) : null);
    setDone("");
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      show(await readFile(f));
    } catch (error) {
      setLines(null);
      setErrors([error instanceof Error ? error.message : "Fichier illisible."]);
    } finally {
      if (file.current) file.current.value = "";
    }
  }

  function confirm() {
    if (!lines) return;
    commit(applyImport(shop, lines, mode));
    const created = lines.filter((l) => l.status === "nouveau").length;
    setDone(`${lines.length} article(s) importé(s) : ${created} nouveau(x), ${lines.length - created} mis à jour.`);
    setLines(null);
    setErrors([]);
  }

  return (
    <div className="import-box">
      <div className="import-head">
        <b>Ajouter beaucoup d'articles d'un coup</b>
        <span className="note">Un fichier Excel, ou une liste copiée-collée. Tu vois tout avant d'enregistrer.</span>
      </div>
      <div className="import-actions">
        <input ref={file} type="file" accept=".xlsx,.xls,.csv,.txt" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        <Button className="h-11 rounded-full px-5 font-semibold" onClick={() => file.current?.click()}>
          <Icon name="tableur" size="sm" /> Importer un fichier Excel
        </Button>
        <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setPaste(paste === null ? "" : null)}>
          <Icon name="coller" size="sm" /> Coller une liste
        </Button>
        <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => download("jokko-modele-stock.csv", templateCsv())}>
          <Icon name="telecharger" size="sm" /> Modèle à remplir
        </Button>
      </div>

      {paste !== null && (
        <div className="import-paste">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={5}
            placeholder={"Une ligne par article : nom, quantité, prix, unité\nRiz 12 sac 18000\nHuile 10 bidon 7500\nSucre; 40; 700; kg"}
            aria-label="Liste d'articles à coller"
          />
          <Button className="h-10 rounded-full px-5" disabled={!paste.trim()} onClick={() => show(textToRows(paste))}>Lire la liste</Button>
        </div>
      )}

      {errors.length > 0 && (
        <ul className="import-errors" role="alert">
          {errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      {done && <p className="note" role="status">{done}</p>}

      {lines && (
        <div className="import-preview">
          <table>
            <thead>
              <tr><th>Article</th><th>Quantité</th><th>Prix</th><th></th></tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.name}>
                  <td>{l.name}</td>
                  <td className="num">{l.quantity} {l.unit}</td>
                  <td className="num">{l.price !== null ? money(l.price) : "—"}</td>
                  <td><span className={`import-tag ${l.status === "nouveau" ? "is-new" : ""}`}>{l.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <fieldset className="import-mode">
            <legend>Les quantités du fichier, c'est :</legend>
            <label><input type="radio" checked={mode === "remplacer"} onChange={() => setMode("remplacer")} /> mon inventaire (le stock devient ces quantités)</label>
            <label><input type="radio" checked={mode === "ajouter"} onChange={() => setMode("ajouter")} /> une livraison (on ajoute au stock actuel)</label>
          </fieldset>
          <div className="import-actions">
            <Button className="h-11 rounded-full px-5 font-semibold" onClick={confirm}>Enregistrer {lines.length} article(s)</Button>
            <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => setLines(null)}>Annuler</Button>
          </div>
        </div>
      )}
    </div>
  );
}
