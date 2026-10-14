/**
 * What volunteers are asked about an object, for the /contribute trial.
 *
 * Not in the schema on purpose: these are not catalogue fields, they are prompts
 * for memories, and the trial expects to reword them. The wording actually shown
 * is saved with every answer (question_text), so changing a line here never
 * muddles what earlier answers were replying to.
 *
 * Three questions, open ones. More than that and people stop; one per field
 * would be an interrogation (the same reasoning as the voice design in AGENTS.md).
 */

export interface Question {
  key: "use" | "origin" | "story" | "ai_check";
  ask: string;
  hint: string;
}

export const QUESTIONS: Question[] = [
  {
    key: "use",
    ask: "What is it, and what was it used for?",
    hint: "Anything you know or remember — how it worked, who would have used it, roughly when.",
  },
  {
    key: "origin",
    ask: "Where did it come from?",
    hint: "A family, a farm, a shop, a building around Dorrigo… Names of people and places are welcome.",
  },
  {
    key: "story",
    ask: "Is there a story or a memory that goes with it?",
    hint: "Something you saw, were told, or remember. Say if it's something you heard rather than saw.",
  },
];

export const AI_CHECK: Question = {
  key: "ai_check",
  ask: "Is any of that wrong, or is there more to add?",
  hint: "The computer only has the photographs. You may know better.",
};
