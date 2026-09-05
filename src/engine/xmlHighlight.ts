// Lightweight XML syntax highlighter for displaying the compiled handoff
// document. The input is always our own compileXml() output, which already
// HTML-entity-escapes every value it inserts — so this module wraps tokens
// in color spans without re-escaping (that would double-encode entities
// like "&amp;" into "&amp;amp;"). Structural punctuation it emits itself
// is hardcoded and safe.

export function highlightXml(xml: string): string {
  const tagOrText = /(<[^>]+>)|([^<]+)/g;
  let out = '';
  let match: RegExpExecArray | null;
  while ((match = tagOrText.exec(xml))) {
    if (match[1]) {
      out += highlightTag(match[1]);
    } else if (match[2]) {
      out += `<span class="xml-text">${match[2]}</span>`;
    }
  }
  return out;
}

function highlightTag(tag: string): string {
  const inner = tag.slice(1, -1); // strip outer < >

  if (inner.startsWith('?')) {
    return `<span class="xml-decl">&lt;${inner}&gt;</span>`;
  }

  const closing = inner.startsWith('/');
  const selfClosing = inner.endsWith('/');
  let body = closing ? inner.slice(1) : inner;
  if (selfClosing) body = body.slice(0, -1);
  body = body.trim();

  const firstSpace = body.search(/\s/);
  const tagName = firstSpace === -1 ? body : body.slice(0, firstSpace);
  const attrsStr = firstSpace === -1 ? '' : body.slice(firstSpace);

  let attrsHtml = '';
  const attrRe = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  let am: RegExpExecArray | null;
  while ((am = attrRe.exec(attrsStr))) {
    attrsHtml += ` <span class="xml-attr">${am[1]}</span>=<span class="xml-punc">"</span><span class="xml-attrval">${am[2]}</span><span class="xml-punc">"</span>`;
  }

  const open = `<span class="xml-punc">&lt;${closing ? '/' : ''}</span>`;
  const close = `<span class="xml-punc">${selfClosing ? '/' : ''}&gt;</span>`;
  return `${open}<span class="xml-tag">${tagName}</span>${attrsHtml}${close}`;
}
