import { Card } from '../components/ui.js'
import MiniDemo from '../components/welcome/MiniDemo.js'
import WelcomeFaq from '../components/welcome/WelcomeFaq.js'
import {
  Hero,
  ValueProps,
  GoodFirstEdits,
  StartCta,
  MiniPath,
} from '../components/welcome/parts.js'

// The welcome page: a reading column, and a rail beside it that doesn't scroll
// away.
//
// A visitor needs a picture of what they're about to do, but answering that
// with more full-width rows in a single column would leave most of the window
// empty and push the only button on the page further and further down.
//
// So the split is between narrative and reference. The column argues, once, in the
// order someone reads; the rail holds what you might want at any point and
// never moves — how long this takes, the questions that stop people, and a
// button, so the page never has to be finished to be acted on. Nobody arrives
// here cold: they clicked "contribute" somewhere else, and the stepper above
// already told them they're inside something. The page's job is to stop them
// talking themselves out of it, not to sell. What it doesn't do yet is carry
// the story past the send button.
export default function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,44rem)_minmax(0,19rem)] lg:justify-center">
      {/* `px-5` on a phone rather than `px-8`: the demo inside is the narrowest
          thing on the page and 24px of reclaimed width matters more there than
          the extra margin does. */}
      <Card className="w-full px-5 py-10 sm:px-8 lg:px-10">
        <Hero />

        {/* Up here as well as at the foot. It costs one button and it means a
            warm visitor never has to read the page to find its control. */}
        <div className="mt-7">
          <StartCta onNext={onNext} footnote={false} />
        </div>

        <div className="mt-9">
          <MiniDemo />
        </div>

        <GoodFirstEdits className="mt-9" />

        <ValueProps className="mt-9" />

        <div className="mt-9">
          <StartCta onNext={onNext} />
        </div>
      </Card>

      <aside className="flex w-full flex-col gap-4 lg:sticky lg:top-20">
        <Card className="px-5 py-5">
          <MiniPath />
        </Card>

        <WelcomeFaq limit={3} />

        <Card className="px-5 py-4">
          <StartCta onNext={onNext} size="sm" footnote={false} />
        </Card>
      </aside>
    </div>
  )
}
