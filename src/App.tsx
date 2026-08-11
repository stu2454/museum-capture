import { useCallback, useEffect, useState } from "react";
import { CaptureFlow } from "./components/CaptureFlow";
import { RecordList } from "./components/RecordList";
import { newId, records } from "./db";
import { toBundle } from "./export";
import { downloadFile } from "./media";
import { schema } from "./schema";
import { startAutoSync } from "./sync";
import type { ArtefactRecord } from "./types";

export default function App() {
  const [list, setList] = useState<ArtefactRecord[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [current, setCurrent] = useState<ArtefactRecord | null>(null);

  const refresh = useCallback(() => {
    void records.all().then(setList);
  }, []);

  useEffect(refresh, [refresh]);

  // Sync runs in the background: on load, when the connection returns, and every
  // few minutes. It is never a precondition for cataloguing — IndexedDB stays the
  // working copy and the app is fully usable with no signal.
  useEffect(() => startAutoSync(() => refresh()), [refresh]);

  useEffect(() => {
    if (!openId) {
      setCurrent(null);
      return;
    }
    void records.get(openId).then((found) => setCurrent(found ?? null));
  }, [openId]);

  function start() {
    const record: ArtefactRecord = {
      id: newId("rec"),
      schemaVersion: schema.schema_version,
      registrationNumber: null,
      status: "draft",
      values: {},
      photos: [],
      capturedBy: localStorage.getItem("volunteerName") ?? "",
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

  if (openId && current) {
    return (
      <CaptureFlow
        record={current}
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
      unsynced={unsynced}
      onOpen={setOpenId}
      onStart={start}
      onExport={exportAll}
    />
  );
}
