import { SPOTLIGHT_URL } from '../../lib/prTemplate.js'

// "Add me to the contributors list": a profile in contributors.json, sent with
// the suggestion. It's what the Spotlight Zone shows, and where the badges a
// contributor's merged suggestions earn are kept: without one, they're earned
// and never shown.
//
// Offered to anyone sending without a profile yet, ticked, because most people
// want the credit; but it publishes their name and company, so what goes out is
// shown as it will look, and unticking is one click. It's a profile only: being
// listed as an author of a page is a separate question (contributing guide,
// "Attribution and contributor roles").

export interface ProfileFields {
  name: string
  job_title: string
  company: string
  website: string
  twitter: string
  description: string
}

export interface ProfileChoice {
  on: boolean
  fields: ProfileFields
}

export default function ProfileCard({
  login,
  value,
  onChange,
}: {
  login: string
  value: ProfileChoice
  onChange: (v: ProfileChoice) => void
}) {
  const { on, fields } = value
  const set = (k: keyof ProfileFields) => (e: { target: { value: string } }) =>
    onChange({ on, fields: { ...fields, [k]: e.target.value } })
  const subtitle = [fields.job_title, fields.company].filter((x) => x.trim()).join(' · ')
  const input =
    'mt-1 w-full rounded-lg border border-fw-border bg-fw-surface-2 px-2.5 py-1.5 text-[0.8125rem] text-fw-text placeholder:text-fw-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand'
  const label = 'block text-xs font-medium text-fw-muted'

  return (
    <section className="rounded-xl border border-brand/40 bg-brand-soft/30 p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange({ on: e.target.checked, fields })}
          className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-brand"
        />
        <span>
          <span className="block text-sm font-semibold text-fw-strong">Add me to the contributors list</span>
          <span className="mt-1 block text-[0.8125rem] leading-relaxed text-fw-muted">
            Every merged suggestion earns badges on your profile in the{' '}
            <a href={SPOTLIGHT_URL} target="_blank" rel="noopener noreferrer" className="text-brand-hover underline">
              Spotlight Zone
            </a>
            : your first contribution, then 5, 10 and 25. You don&apos;t have a profile yet, so we&apos;ll add one with
            this suggestion. It&apos;s public, and filled in from your GitHub profile.
          </span>
        </span>
      </label>

      {on && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_15rem]">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2">
              <span className={label}>Name</span>
              <input value={fields.name} onChange={set('name')} placeholder={login} className={input} />
            </label>
            <label>
              <span className={label}>Job title</span>
              <input value={fields.job_title} onChange={set('job_title')} placeholder="Optional" className={input} />
            </label>
            <label>
              <span className={label}>Company</span>
              <input value={fields.company} onChange={set('company')} placeholder="Optional" className={input} />
            </label>
            <label>
              <span className={label}>Website</span>
              <input value={fields.website} onChange={set('website')} placeholder="https://" className={input} />
            </label>
            <label>
              <span className={label}>X / Twitter</span>
              <input value={fields.twitter} onChange={set('twitter')} placeholder="@handle" className={input} />
            </label>
            <label className="col-span-2">
              <span className={label}>One line about you</span>
              <input
                value={fields.description}
                onChange={set('description')}
                placeholder="Frameworks Contributor"
                maxLength={160}
                className={input}
              />
            </label>
          </div>

          {/* As it will look in the Spotlight Zone, roughly. */}
          <div aria-label="Preview of your profile" className="self-start rounded-lg border border-fw-border bg-fw-surface p-3">
            <div className="flex items-center gap-2.5">
              <img
                src={`https://avatars.githubusercontent.com/${login}`}
                alt=""
                className="h-10 w-10 rounded-full border border-fw-border"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fw-strong">{fields.name.trim() || login}</p>
                {subtitle && <p className="truncate text-xs text-fw-muted">{subtitle}</p>}
              </div>
            </div>
            <p className="mt-2 text-xs text-fw-muted">{fields.description.trim() || 'Frameworks Contributor'}</p>
            <p className="mt-2 text-[0.6875rem] text-fw-faint">Badges appear here as your suggestions are merged.</p>
          </div>
        </div>
      )}
    </section>
  )
}
