/**
 * The accession tag. Every catalogued object in a museum has a tie-on tag with
 * its registration number written on it; this is that tag, on screen, carrying
 * the same number and the object's name as it gets filled in.
 *
 * Registration numbers may be blank: whether the app assigns them or a committee
 * member allocates them beforehand is still an open question for the museum
 * (see open_questions in the schema). Until that's settled, an unnumbered record
 * says so plainly rather than inventing a number nobody agreed to.
 */

interface Props {
  registrationNumber: string | null;
  objectName?: string;
}

export function AccessionTag({ registrationNumber, objectName }: Props) {
  return (
    <div className="tag">
      <span className="tag-hole" aria-hidden="true" />
      <span className={`tag-number ${registrationNumber ? "" : "is-unassigned"}`}>
        {registrationNumber || "no number yet"}
      </span>
      {objectName && <span className="tag-name">{objectName}</span>}
    </div>
  );
}
