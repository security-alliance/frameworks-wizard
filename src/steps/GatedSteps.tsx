import { StepPlaceholder } from '../components/ui.js'

// Steps that are still placeholders. Only the last one is left; sign-in and
// sending have their own files (ConnectStep.tsx, SubmitStep.tsx).

// Confirmation, once submitting is wired up.
export function DoneStep() {
  return (
    <StepPlaceholder title="You're all set">
      Once submissions are live, this is where you&apos;ll be able to follow your
      suggestion through review, and get a thank-you for helping strengthen Web3
      security.
    </StepPlaceholder>
  )
}
