/**
 * Preparing the eHive import.
 *
 * This screen exists because the last step of the process is a person, not a
 * request. eHive has no write API: imports are run by Vernon Systems staff from a
 * spreadsheet sent to them, with the images alongside. So what this produces is a
 * file and a set of instructions, and the honest thing is to say so plainly rather
 * than dress a manual process up as a button that "sends to eHive".
 *
 * The pick list report is the part that earns its place. Several fields that are
 * free text here are controlled vocabularies in eHive, where a value that doesn't
 * match an existing term creates a new one. Nobody notices until the vocabulary is
 * full of near-duplicates, by which time the fix is manual and nobody does it. So
 * the values are shown BEFORE the file is sent, when correcting them is still
 * cheap - flagged, never silently altered, because changing what a volunteer typed
 * without telling anyone is the one thing this app never does.
 */

import { useEffect, useState } from "react";
import { api, type EhiveBundle } from "./api";
import { downloadFile } from "../media";

export function EhiveExport({ onBack }: { onBack: () => void }) {
  const [bundle, setBundle] = useState<EhiveBundle | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<{
    imported: number;
    unmapped_fields: Array<{ field: string; count: number }>;
  } | null>(null);
  const [importProblem, setImportProblem] = useState<string | null>(null);

  useEffect(() => {
    api
      .ehiveExport()
      .then(setBundle)
      .catch((error) =>
        setProblem(error instanceof Error ? error.message : "Couldn't build the export.")
      );
  }, []);

  const stamp = new Date().toISOString().slice(0, 10);
  const newTerms = bundle?.pick_lists.filter((w) => !w.known) ?? [];

  function downloadSpreadsheet() {
    if (bundle) downloadFile(`ehive-import-${stamp}.csv`, bundle.csv, "text/csv");
  }

  async function runImport() {
    setImporting(true);
    setImportProblem(null);
    try {
      setImported(await api.ehiveImport());
      // The export's warnings change once those records are in the collection.
      setBundle(await api.ehiveExport());
    } catch (error) {
      setImportProblem(
        error instanceof Error ? error.message : "Couldn't import the eHive records."
      );
    } finally {
      setImporting(false);
    }
  }

  function downloadPhotoList() {
    if (!bundle) return;
    const rows = ["filename,record", ...bundle.photos.map((p) => `${p.filename},${p.record}`)];
    downloadFile(`ehive-photographs-${stamp}.csv`, rows.join("\r\n"), "text/csv");
  }

  if (problem) {
    return (
      <div className="app">
        <button type="button" className="btn btn-quiet" onClick={onBack} style={{ marginTop: 12 }}>
          Back to the collection
        </button>
        <div className="notice notice-problem" style={{ marginTop: 16 }}>
          <h4>Couldn&apos;t build the export</h4>
          <p style={{ margin: 0 }}>{problem}</p>
        </div>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="app">
        <p className="muted" style={{ paddingTop: 40 }}>Building the export…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <button type="button" className="btn btn-quiet" onClick={onBack} style={{ marginTop: 12 }}>
        Back to the collection
      </button>

      <header className="masthead">
        <p className="eyebrow">Administration</p>
        <h1>Send records to eHive</h1>
      </header>

      <p className="muted">
        {bundle.record_count} {bundle.record_count === 1 ? "record" : "records"} and{" "}
        {bundle.photos.length} {bundle.photos.length === 1 ? "photograph" : "photographs"},
        mapped against schema version {bundle.schema_version}.
      </p>

      <div className="notice notice-open">
        <h4>This prepares a file. It doesn&apos;t send anything.</h4>
        <p className="small" style={{ margin: 0 }}>
          eHive imports are run by Vernon Systems from a spreadsheet you send them. Nothing
          here reaches eHive on its own, and nothing in the collection is changed by
          downloading it.
        </p>
      </div>

      {bundle.pick_lists.length > 0 && (
        <>
          <p className="eyebrow" style={{ margin: "26px 0 8px" }}>
            {newTerms.length > 0
              ? `${newTerms.length} ${newTerms.length === 1 ? "value" : "values"} would create a new eHive term`
              : "Every value already exists in eHive"}
          </p>

          {newTerms.length > 0 && (
            <div className="notice notice-problem">
              <p className="small" style={{ margin: 0 }}>
                These fields are pick lists in eHive. A value below that isn&apos;t already one
                of your terms <strong>creates a new one</strong> on import — right when it is
                genuinely a new kind of thing, wrong when it is a second spelling of something
                you already have. Where we can see a close match, it is shown.
              </p>
            </div>
          )}

          <div className="table-wrap">
            <table className="ehive-terms">
              <tbody>
                {bundle.pick_lists.map((w) => (
                  <tr key={`${w.field}:${w.value}`}>
                    <td>
                      {w.value}
                      {w.similar.length > 0 && (
                        <span className="ehive-similar">
                          eHive already has <strong>{w.similar[0]}</strong>
                        </span>
                      )}
                    </td>
                    <td className="ehive-term-field">{w.ehive}</td>
                    <td className="ehive-term-count">
                      {w.count} {w.count === 1 ? "record" : "records"}
                    </td>
                    <td className="ehive-term-state">
                      {w.known ? (
                        <span className="ehive-known">in eHive</span>
                      ) : (
                        <span className="ehive-new">new term</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="eyebrow" style={{ margin: "26px 0 8px" }}>What to do</p>

      <ol className="ehive-steps">
        <li>
          Download the spreadsheet data and open eHive&apos;s own import workbook from{" "}
          <strong>info.ehive.com/importing-data</strong>.
        </li>
        <li>
          Paste the rows into the <strong>Object Data</strong> sheet. The columns are in the
          workbook&apos;s order, so they line up as they are.
        </li>
        <li>
          Add these {bundle.extra_columns.length} columns with the workbook&apos;s{" "}
          <strong>Insert Column</strong> button, then paste their values in:{" "}
          <span className="ehive-extra">{bundle.extra_columns.join(", ")}</span>
        </li>
        <li>
          Gather the photographs into a folder, named exactly as the second file lists them. The
          import silently skips any image whose name doesn&apos;t match.
        </li>
        <li>
          Email the workbook and the photographs to <strong>info@ehive.com</strong>. They run it
          against a test server first and will come back to you.
        </li>
      </ol>

      <button type="button" className="btn btn-wide" onClick={downloadSpreadsheet}>
        Download spreadsheet data
      </button>
      <button
        type="button"
        className="btn btn-quiet btn-wide"
        style={{ marginTop: 10 }}
        onClick={downloadPhotoList}
      >
        Download photograph list
      </button>

      <p className="muted small" style={{ marginTop: 16 }}>
        Donor names, addresses, emails, phone numbers and tax incentive numbers are not in
        either file. They never leave the museum&apos;s own records.
      </p>

      <section className="card" style={{ marginTop: 28 }}>
        <h3 style={{ marginTop: 0, fontWeight: 500 }}>Bring eHive records into the collection</h3>
        <p className="small" style={{ marginTop: 0 }}>
          The museum&apos;s existing eHive records can be added to this collection so everything
          is searchable in one place. Each keeps its eHive id, so if one is edited here a later
          export updates the original rather than creating a second copy.
        </p>
        <p className="small muted">
          Safe to run more than once — records are matched on their eHive id, so a second run
          updates the same ones instead of making duplicates.
        </p>

        {imported && (
          <div className="notice notice-ok">
            <p style={{ margin: 0 }}>
              {imported.imported} {imported.imported === 1 ? "record" : "records"} brought in.
              {imported.unmapped_fields.length > 0 && (
                <>
                  {" "}
                  {imported.unmapped_fields.length} eHive{" "}
                  {imported.unmapped_fields.length === 1 ? "field has" : "fields have"} no
                  counterpart here and stayed in the reference copy:{" "}
                  <span className="ehive-extra">
                    {imported.unmapped_fields.map((f) => f.field).join(", ")}
                  </span>
                </>
              )}
            </p>
          </div>
        )}

        {importProblem && <div className="notice notice-problem">{importProblem}</div>}

        <button
          type="button"
          className="btn btn-wide"
          disabled={importing}
          onClick={() => void runImport()}
        >
          {importing ? "Bringing them in…" : "Import eHive records"}
        </button>
      </section>
    </div>
  );
}
