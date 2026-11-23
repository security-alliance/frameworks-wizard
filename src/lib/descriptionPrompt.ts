import { splitFrontmatter } from './github.js'
import { joinBlocks, splitBlocks } from './blocks.js'
import { applyDraft, readDraft } from './drafts.js'
import { newPageRaw, readNewPage } from './newPages.js'
import type { NewPage } from './newPages.js'
import { stripPlaceholders } from './placeholders.js'

// The prompt behind "Copy a prompt for your AI", next to a new page's
// description: the template's rules for a description, real ones from the
// site as examples, and the page as written so far, so the contributor's own
// AI tool has what it needs to suggest one. The wizard calls no AI itself.
//
// Built synchronously, from this browser's copy of the page, so the copy
// happens inside the click: some browsers only allow it there.

// Real descriptions from frameworks.securityalliance.org, all 140-160
// characters: topic first, then the concrete terms people search for.
const EXAMPLES = [
  'Harden GitHub repos with org MFA, protected branches, signed commits, CODEOWNERS, least-privilege tokens, and hardened GitHub Actions defaults.',
  'Threat modeling for Web3 systems: structure assets, threats, and mitigations with STRIDE-oriented analysis and maintain models as systems change.',
  'On-chain security monitoring for Web3 protocols: first principles, alert ownership, redundancy, guidelines, thresholds, and tooling choices.',
]

// Page scaffolding with nothing to describe: imports and the components every
// page carries.
const SCAFFOLD_RE = /^(?:import\s.*|<(?:TagList|AttributionList|ContributeFooter)\b.*\/>\s*)$/

/** A new page's body as it is now in this browser: its draft over its starter,
 *  without placeholders or scaffolding. */
function pageText(page: NewPage): string {
  const { body } = splitFrontmatter(newPageRaw(page))
  const draft = readDraft(page.path)
  const text = joinBlocks(draft ? applyDraft(splitBlocks(body), draft).blocks : splitBlocks(body))
  return stripPlaceholders(text)
    .split('\n')
    .filter((line) => !SCAFFOLD_RE.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function descriptionPrompt(path: string): string | null {
  const page = readNewPage(path)
  if (!page) return null
  return `I'm adding a new page to the SEAL Security Frameworks (frameworks.securityalliance.org), and I need its description: the short summary search engines show under the page title. Please write it from the page below.

Rules:
- Between 140 and 160 characters, spaces included. Count them before you answer.
- One sentence or phrase, in plain text: no quotes, no markdown, no emoji.
- Start with the topic, then name the tools, attacks, standards or practices the page covers, so people searching for them find it.
- Concrete, active wording. No vague openings such as "This page covers" or "Learn about".
- Only mention what the page actually covers.

Good examples from the site:
${EXAMPLES.map((e) => `- ${e}`).join('\n')}

Too vague: "This page covers security topics."

Answer with the description only, on one line.

The page, titled "${page.title}":

${pageText(page)}
`
}
