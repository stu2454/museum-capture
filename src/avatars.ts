/**
 * The badge palette.
 *
 * Museum paint chart, not social media: every colour here is a muted, archival
 * tone drawn from the same world as the rest of the app — registration ink,
 * brass, sage, oxide red. Bright saturated colour would fight the accession tag,
 * which is the one loud element the design allows.
 *
 * Every one of these is dark enough to carry white initials at the size the
 * badge is actually drawn, which is why they sit in a narrow luminance band. If
 * you add one, keep it there — a pale swatch makes the initials unreadable in
 * the poor light these devices get used in.
 *
 * The NAME is what's stored, never the hex. Restyling the palette then costs
 * nothing; changing what's in the database would cost a migration.
 *
 * Keep the names in step with the allowlist in worker/explorer.ts.
 */

export interface Swatch {
  id: string;
  label: string;
  hex: string;
}

export const SWATCHES: Swatch[] = [
  { id: "ink", label: "Ink", hex: "#16283c" },
  { id: "indigo", label: "Indigo", hex: "#3b4a7a" },
  { id: "teal", label: "Teal", hex: "#2f6b6b" },
  { id: "sage", label: "Sage", hex: "#3f6b57" },
  { id: "moss", label: "Moss", hex: "#5a6b39" },
  { id: "ochre", label: "Ochre", hex: "#8a6a1f" },
  { id: "umber", label: "Umber", hex: "#7a5334" },
  { id: "oxide", label: "Oxide", hex: "#a33b32" },
  { id: "plum", label: "Plum", hex: "#6b3a52" },
  { id: "slate", label: "Slate", hex: "#4a5b6b" },
];

/**
 * The colour to draw someone in. An unset or unrecognised name falls back to a
 * colour derived from their address, so a person who has never chosen still gets
 * a consistent one rather than everybody sharing the same grey.
 */
export function swatchFor(colour: string | null | undefined, email: string): Swatch {
  const chosen = SWATCHES.find((s) => s.id === colour);
  if (chosen) return chosen;

  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  return SWATCHES[hash % SWATCHES.length];
}
