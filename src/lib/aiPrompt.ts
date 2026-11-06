// The instructions "Copy instructions for AI" puts on the clipboard.
//
// They're for a contributor who already wrote something and wants an AI tool
// to tidy it into our format and house style. The contributing guide says
// grammar and phrasing help is fine but fully AI-generated pages aren't
// accepted, so the prompt never asks the AI to write or add content: it
// formats and tidies the contributor's own text, and asks rather than guesses.
//
// The style rules are the contributing guide's (docs/pages/contribute/
// contributing.mdx, "Style"), boiled down to what an AI can apply to a draft.
// The formatting rules are what the editor understands when the answer is
// pasted back in.

/**
 * @param above the level of the heading above the cursor (1 for the page
 *   title), so the AI's headings fit where the text is going. null when no
 *   section has the cursor.
 */
export function aiPrompt(above: number | null): string {
  const where =
    above === null
      ? ''
      : above <= 1
        ? '\n- My text starts a new section, so its top headings use "##".'
        : `\n- My text goes under a "${'#'.repeat(above)}" heading, so its own headings start at "${'#'.repeat(above + 1)}".`

  return `I'm suggesting a change to a page of the SEAL Security Frameworks (frameworks.securityalliance.org). Below is what I wrote. Please tidy it into the site's format and style, and keep it mine.

What to do:
- Fix grammar, spelling and phrasing, and make sentences clear and concise.
- Don't add facts, claims, examples or sources that aren't in my text. If something is unclear, ask me instead of guessing.
- Keep my links. Don't invent new ones.

Style (from the site's contributing guide):
- Objective, explanatory tone. No first person: "Enable 2FA", not "I suggest enabling 2FA".
- Headings in sentence case: "## Further reading", not "## Further Reading".
- Use "must", "should" and "may" for requirements, with concrete subjects ("signers", "operators").
- Spell out an acronym the first time it's used.
- Prefer wording that won't date quickly: tools and practices in Web3 change fast.
- Break complex points into lists.

Formatting (Markdown, which the site's editor turns into formatting when pasted):
- Headings: "## " for a section, "### " for a subsection, "#### " for a smaller one.
- Headings go down one level at a time: a "####" sits under a "###", never straight under a "##".${where}
- Paragraphs of plain text, with a blank line between them.
- **bold** and *italic*.
- Links: [text](https://example.com).
- Bulleted lists with "- ", numbered lists with "1. ".
- Checklists, for steps a reader should do and tick off: "- [ ] " at the start of each item.
- Quotes or notes: "> " at the start of the line.
- \`inline code\` for setting names, commands and file names.
- No HTML, no tags such as <Checklist> or <details>, no tables or images.

Put your whole answer in one markdown code block, so I can copy it with the code block's copy button.

Here's what I wrote:
`
}
