// The contributor journey.
//
// Labels are deliberately plain. Naming the machinery ("GitHub sign-in", "Open
// a PR") tells someone who has never used GitHub nothing about what they're
// being asked to do. What lands where is the wizard's job to know; the
// contributor's job is to write a good edit.
//
// - "Write", not "Edit": editing is what the wizard does to a file, writing is
//   what the contributor does (the landing page's "write, don't code").
// - "Check", not "Review": a maintainer reviews the suggestion afterwards, so
//   the contributor reading their own changes back needs a word of its own.
//
// The step ids (`edit`, `review`) are internal and don't follow the labels.
//
// There is no sign-in step. Signing in is only needed to send, so it happens
// on Send, where the button that needs it is (see `SendPanel`). As a step of
// its own it could be skipped, so it was a wall that wasn't one, and it put a
// tick beside "not signed in".
//
// The `sub` lines are fallbacks. Where the wizard knows something true about a
// step — which page you picked, how many sections you changed — the stepper
// shows that instead. See `Stepper`.

/** The steps, by id. Typing these as a union means a mistyped `step.id ===`
 *  comparison is a compile error rather than a branch that silently never
 *  runs. */
export type StepId =
  | 'welcome'
  | 'choose'
  | 'edit'
  | 'review'
  | 'submit'
  | 'done'

export interface Step {
  id: StepId
  label: string
  sub: string
  /** The step is about a particular docs page, and so belongs in the URL as
   *  `?page=…`. The steps without it read the same whichever page is selected,
   *  and carrying the parameter there only made the address bar noisy. */
  page?: boolean
  /** The forward button's label: where it goes, rather than "Continue" on
   *  every step. Welcome and Send have their own buttons, and Done has none. */
  next?: string
}

export const STEPS: Step[] = [
  { id: 'welcome', label: 'Start', sub: 'What this does' },
  { id: 'choose', label: 'Choose', sub: 'Pick a page', page: true, next: 'Start writing' },
  { id: 'edit', label: 'Write', sub: 'Make your changes', page: true, next: 'Read it back' },
  { id: 'review', label: 'Check', sub: 'Read it back', page: true, next: 'Ready to send' },
  { id: 'submit', label: 'Send', sub: 'Submit for review', page: true },
  { id: 'done', label: 'Done', sub: 'All set' },
]

export const stepIndex = (id: string): number => STEPS.findIndex((s) => s.id === id)
