import { useCallback, useEffect, useState } from "react";
import { CaptureFlow } from "./components/CaptureFlow";
import { RecordList } from "./components/RecordList";
import { newId, records } from "./db";
import { toBundle } from "./export";
import { downloadFile } from "./media";
import { schema } from "./schema";
import { Explorer } from "./explorer/Explorer";
import { startAutoSync, type SyncOutcome } from "./sync";
import { Help } from "./components/Help";
import { loadIdentity, type Identity, type Person } from "./identity";
import { opensOnCatalogue } from "./landing";
import type { ArtefactRecord } from "./types";

/** Nothing known yet. Replaced on first load, from the network or the cache. */
const NO_IDENTITY: Identity = {
  state: "unknown",
  account: null,
  people: [],
  cataloguer: null,
  fromCache: false,
};

export default function App() {
  // Two apps, one deployment. The capture app is for volunteers holding an
  // object; the explorer is for anyone looking things up. Keeping them on
  // separate paths means the capture flow stays free of search UI, and the
  // explorer never risks someone accidentally editing a record.
  if (window.location.pathname.startsWith("/explore")) {
    return <Explorer />;
  }

  // A bare "/" on something that looks like a desk opens the catalogue instead.
  // The URL is corrected as well as the view, so the address bar doesn't lie and
  // the page can be bookmarked or sent to someone. replaceState rather than a
  // redirect: no second round trip, which matters on museum wifi.
  if (opensOnCatalogue()) {
    window.history.replaceState(null, "", "/explore");
    return <Explorer />;
  }


  const [list, setList] = useState<ArtefactRecord[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncOutcome | null>(null);
  const [identity, setIdentity] = useState<Identity>(NO_IDENTITY);
  const [showHelp, setShowHelp] = useState(false);
  const [current, setCurrent] = useState<ArtefactRecord | null>(null);

  const refresh = useCallback(() => {
    void records.all().then(setList);
  }, []);

  useEffect(refresh, [refresh]);

  // Who is holding the phone. Answered from the last known copy when there's no
  // signal, so this never becomes a reason someone can't start work.
  useEffect(() => {
    void loadIdentity().then(setIdentity);
  }, []);

  // Sync runs in the background: on load, when the connection returns, and every
  // few minutes. It is never a precondition for cataloguing — IndexedDB stays the
  // working copy and the app is fully usable with no signal.
  useEffect(
    () =>
      startAutoSync((outcome) => {
        setSync(outcome);
        refresh();
      }),
    [refresh]
  );

  useEffect(() => {
    if (!openId) {
      setCurrent(null);
      return;
    }
    void records.get(openId).then((found) => setCurrent(found ?? null));
  }, [openId]);

  function start() {
    // The home screen disables the button without a cataloguer; this is the
    // belt-and-braces half. An unattributable record is worse than no record.
    if (!identity.cataloguer) return;

    const record: ArtefactRecord = {
      id: newId("rec"),
      schemaVersion: schema.schema_version,
      registrationNumber: null,
      status: "draft",
      values: {},
      photos: [],
      // An email address, not a typed name: it identifies one person, matches
      // the museum's user list, and gives anyone with a question later someone
      // they can actually contact.
      capturedBy: identity.cataloguer.email,
      capturedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    void records.put(record).then(() => setOpenId(record.id));
  }

  function exportAll() {
    const bundle = toBundle(list);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`catalogue-${stamp}.json`, JSON.stringify(bundle, null, 2));
  }

  if (showHelp) {
    return <Help onBack={() => setShowHelp(false)} />;
  }

  if (openId && current) {
    return (
      <CaptureFlow
        record={current}
        cataloguer={identity.cataloguer}
        onExit={() => {
          setOpenId(null);
          refresh();
        }}
      />
    );
  }

  const unsynced = list.filter((r) => !r.syncedAt || r.updatedAt > r.syncedAt).length;

  return (
    <RecordList
      list={list}
      identity={identity}
      onCataloguer={(person: Person) =>
        setIdentity((current) => ({ ...current, cataloguer: person }))
      }
      // A changed name or colour has to land in all three places at once, or the
      // corner badge and the picker disagree with the panel that just saved it.
      onProfile={(person: Person) =>
        setIdentity((current) => ({
          ...current,
          account: person,
          cataloguer:
            current.cataloguer?.email === person.email ? person : current.cataloguer,
          people: current.people.map((p) => (p.email === person.email ? person : p)),
        }))
      }
      unsynced={unsynced}
      onHelp={() => setShowHelp(true)}
      failingSince={sync?.failingSince}
      onOpen={setOpenId}
      onStart={start}
      onExport={exportAll}
    />
  );
}
