/**
 * Warns when records are sitting somewhere iOS may clear them.
 *
 * Written as instruction, not alarm: it says what to do, in the words Apple
 * uses on the device, so a volunteer can follow it without help.
 */

import { useEffect, useState } from "react";
import { checkStorage, type StorageHealth } from "../storage";

export function StorageNotice() {
  const [health, setHealth] = useState<StorageHealth | null>(null);

  useEffect(() => {
    void checkStorage().then(setHealth);
  }, []);

  if (!health?.atRiskOfEviction) return null;

  return (
    <div className="notice notice-open">
      <h4>Add this to your Home Screen</h4>
      <p style={{ margin: "0 0 8px" }}>
        Records are saved on this device. If you open the app in Safari and don&apos;t come back
        for a week, iPhone and iPad can clear them.
      </p>
      <p style={{ margin: 0 }}>
        Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>, and open the app from
        there from now on. Export your records regularly either way.
      </p>
    </div>
  );
}
