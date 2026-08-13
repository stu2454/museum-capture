/**
 * How to use the app.
 *
 * The printed manual exists, but it lives in a folder in the office and the
 * volunteer is in the store room holding a butter churn. This is the same
 * guidance where they actually need it.
 *
 * Tabs rather than one long scroll: on a phone, a page this long buries whatever
 * you're looking for. Four sections, each answerable in a few seconds.
 *
 * The section titles below are the app's own capture groups. If the schema
 * changes, change these to match — nothing enforces it, and help that describes
 * screens the volunteer isn't seeing is worse than no help at all.
 */

import { useState } from "react";

type TabId = "start" | "object" | "photos" | "problems";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "start", label: "Start here" },
  { id: "object", label: "Each object" },
  { id: "photos", label: "Photographs" },
  { id: "problems", label: "Problems" },
];

export function Help({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<TabId>("start");

  return (
    <div className="app">
      <button type="button" className="btn btn-quiet" onClick={onBack} style={{ marginTop: 12 }}>
        Back
      </button>

      <header className="masthead">
        <p className="eyebrow">Dorrigo Museum</p>
        <h1>How to use this app</h1>
      </header>

      <p className="muted" style={{ marginTop: -4 }}>
        You don&apos;t need to be good with computers. The app asks one question at a time and
        saves as you go. There&apos;s no way to break it.
      </p>

      <div className="tabbar" role="tablist" aria-label="Help sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className={`tab ${tab === t.id ? "is-current" : ""}`}
            onClick={(e) => {
              setTab(t.id);
              e.currentTarget.scrollIntoView({ block: "nearest", inline: "center" });
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "start" && <Start />}
        {tab === "object" && <EachObject />}
        {tab === "photos" && <Photographs />}
        {tab === "problems" && <Problems />}
      </div>
    </div>
  );
}

function Start() {
  return (
    <>
      <div className="notice notice-open">
        <h4>Do this first, once, on each device</h4>
        <p style={{ margin: 0 }}>
          Add the app to your Home Screen. Tap <strong>Share</strong>, then{" "}
          <strong>Add to Home Screen</strong>, then <strong>Add</strong>. Open it from that icon
          from now on — not from a Safari tab, or your records will look as though they&apos;ve
          vanished.
        </p>
      </div>

      <Step n={1} title="Put your name in">
        There&apos;s a box on the first screen asking who&apos;s cataloguing today. Type your name
        once and the app remembers it. Every record carries it, so anyone with a question later
        knows who to ask. It isn&apos;t a login and there&apos;s no password.
      </Step>

      <Step n={2} title="Sign in once, so your work is saved">
        Open the catalogue at <strong>/explore</strong> and sign in with your email. You&apos;ll be
        emailed a short code. You only need to do this once on each device — after that your
        records send themselves to the museum&apos;s server.
      </Step>

      <Step n={3} title="What to have with you">
        The object, somewhere clean and well lit to stand it, a tape measure, and the register or
        the object&apos;s existing tag so you have its number. Gloves if the object needs them.
      </Step>

      <h3 className="help-h">Three things worth knowing</h3>
      <Point title="You cannot lose your place">
        Every word is saved the moment you type it. If the phone rings or the battery dies, the
        record is exactly where you left it.
      </Point>
      <Point title="You can leave anything blank">
        If you don&apos;t know, move on. A blank field is honest. A guess is a problem, because the
        next person can&apos;t tell it apart from a fact.
      </Point>
      <Point title="Nothing you enter is final">
        When you save, the record is marked for review. Someone else checks it before it becomes
        part of the catalogue proper. You are not the last line of defence.
      </Point>
    </>
  );
}

function EachObject() {
  const questions: Array<[string, string]> = [
    ["Which object is this?", "The number from the object's tag or the register. Type it exactly, including full stops and slashes."],
    ["What is it?", "The everyday name. \"Butter churn\", not \"dairy implement\"."],
    ["Describe it", "What you can see — shape, colour, parts, decoration, materials. Read out any writing or maker's marks exactly as they appear, including odd spelling."],
    ["How big is it?", "Height, width and length. Pick mm or cm and use the same one all day."],
    ["What condition is it in?", "Be specific: \"crack 40mm in the lid, old glue repair at the handle\" beats \"poor condition\". Say whether it's complete."],
    ["Who made it, and when?", "Only if you know. An approximate date is a proper answer — type \"about 1890\" or \"1920s\"."],
    ["What's its story?", "Previous owners, how it was used, who donated it. This is the part no future researcher can reconstruct. If you only have time for one thing, do this one."],
    ["Where does it live?", "Precise enough that someone else could find it without you: \"Store room B, shelf 3, left end\"."],
  ];

  return (
    <>
      <p className="muted small">
        Photograph the object, then answer eight short screens. About ten minutes an object.
      </p>

      {questions.map(([title, text], i) => (
        <Step key={title} n={i + 1} title={title}>
          {text}
        </Step>
      ))}

      <Step n={9} title="Check it, then save">
        The last screen shows the whole record laid out like the paper worksheet. Read it back
        against the object — not against your memory of it. Then tap{" "}
        <strong>Save for review</strong>.
      </Step>

      <div className="notice notice-problem">
        <h4>The app never asks for donor details</h4>
        <p style={{ margin: 0 }}>
          No name, address, phone or email. That&apos;s personal information about a living person,
          kept separately by the committee with the deed of gift. If someone tells you donor
          details, pass them to the committee rather than typing them here.
        </p>
      </div>
    </>
  );
}

function Photographs() {
  return (
    <>
      <p className="muted small">
        The photographs will outlast every other part of the record. Someone in fifty years may
        never see this object, but they will see your picture of it.
      </p>

      <h3 className="help-h">Take four photographs</h3>
      <Point title="1. The whole object">Fills the frame, plain background, nothing cropped off.</Point>
      <Point title="2. Maker&apos;s marks and labels">Close enough to read.</Point>
      <Point title="3. Any damage or repair">Cracks, wear, missing parts.</Point>
      <Point title="4. One with a ruler in shot">Settles arguments about size for good.</Point>

      <h3 className="help-h">Getting a good photograph</h3>
      <Point title="Square on, from directly above">
        An angled photo distorts the shape and won&apos;t match your measurements.
      </Point>
      <Point title="Light from the side, not behind you">
        A window to one side shows shape and texture. Watch you&apos;re not casting your own shadow
        over the object.
      </Point>
      <Point title="Never balance something fragile">
        A worse photograph is always better than a broken artefact.
      </Point>

      <div className="notice notice-open">
        <h4>Two buttons, and they do different things</h4>
        <p style={{ margin: 0 }}>
          <strong>Take a photo</strong> opens the camera. <strong>Choose from library</strong>{" "}
          picks pictures you&apos;ve already taken. Tap any thumbnail to make it the main image;
          tap the × to remove one. Large photos take a few seconds each — that&apos;s normal.
        </p>
      </div>
    </>
  );
}

function Problems() {
  const items: Array<[string, string]> = [
    ["My records have disappeared.", "Almost always because the app was opened a different way. The Home Screen icon and the Safari tab keep separate records. Open it from the icon."],
    ["It says \"not yet backed up\".", "Those records are still only on this device. They send themselves when you have signal. If it stays that way for days, mention it to whoever looks after the app — your work is safe on the device meanwhile."],
    ["I can't find someone else's record here.", "This app only shows what you catalogued on this device. The full collection is in the catalogue at /explore, where everyone can search it."],
    ["The registration number is already used.", "Another record on this device has the same number. Check the register. If it's the same object, open the existing record instead."],
    ["There's no signal in the store room.", "Carry on. The app works completely offline and sends everything later."],
    ["I've made a mistake in a saved record.", "Open it from the first screen and change it. Nothing is locked, and every earlier version is kept."],
    ["I don't know the answer to a question.", "Leave it blank and move on. That is the correct thing to do."],
  ];

  return (
    <>
      {items.map(([q, a]) => (
        <div key={q} className="card">
          <strong>{q}</strong>
          <p className="small" style={{ margin: "6px 0 0" }}>
            {a}
          </p>
        </div>
      ))}

      <div className="notice notice-open">
        <h4>If in doubt, stop and ask</h4>
        <p style={{ margin: 0 }}>
          Nothing about cataloguing is urgent. A record left half-finished while you check
          something costs nothing. A confident guess written into the catalogue can mislead people
          for decades.
        </p>
      </div>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="help-step">
      <span className="help-num">{n}</span>
      <div>
        <strong>{title}</strong>
        <p className="small" style={{ margin: "4px 0 0" }}>
          {children}
        </p>
      </div>
    </div>
  );
}

function Point({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="help-point">
      <strong>{title}</strong>
      <p className="small" style={{ margin: "3px 0 0" }}>
        {children}
      </p>
    </div>
  );
}
