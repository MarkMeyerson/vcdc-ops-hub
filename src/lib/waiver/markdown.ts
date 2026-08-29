// A very small Markdown subset, enough for waiver text and nothing more.
//
// Written rather than pulled in because the input is a document an admin
// pastes into a textarea and the output is rendered as HTML on a public
// page. A general Markdown library would also accept raw HTML, which is
// exactly the thing that must not be accepted here. This escapes first and
// only then applies its own tags, so nothing an admin pastes can introduce
// markup, a script, or a link to somewhere else.
//
// Supported: # ## ### headings, - bullets, **bold**, blank-line paragraphs.
// Everything else renders as the literal text it is.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(text: string): string {
  return escapeHtml(text).replace(
    /\*\*([^*]+)\*\*/g,
    '<strong>$1</strong>'
  )
}

export function renderWaiverMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let paragraph: string[] = []
  let inList = false

  const closeParagraph = () => {
    if (paragraph.length > 0) {
      out.push(`<p>${inline(paragraph.join(' '))}</p>`)
      paragraph = []
    }
  }
  const closeList = () => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (line.trim() === '') {
      closeParagraph()
      closeList()
      continue
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      closeParagraph()
      closeList()
      const level = heading[1]?.length ?? 1
      out.push(`<h${level}>${inline(heading[2] ?? '')}</h${level}>`)
      continue
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      closeParagraph()
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      out.push(`<li>${inline(bullet[1] ?? '')}</li>`)
      continue
    }

    closeList()
    paragraph.push(line.trim())
  }

  closeParagraph()
  closeList()
  return out.join('\n')
}

// First heading, for a page title. Falls back to a fixed string rather than
// to an empty one, because an admin can publish text with no heading at all.
export function waiverTitle(source: string): string {
  const match = /^#\s+(.*)$/m.exec(source)
  return match?.[1]?.trim() || 'Ride waiver'
}
