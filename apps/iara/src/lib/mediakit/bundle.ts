/**
 * Mediakit bundle — unpack/repack of the Claude Design "standalone" export.
 *
 * The standalone.html is a self-booting bundle ("Bundled Page"): a loader
 * script plus three inert <script> blocks:
 * - `__bundler/template`  — the deck page HTML as ONE JSON-encoded string
 *                           (this is what the binding engine edits);
 * - `__bundler/manifest`  — JSON map uuid → {mime, data(base64), compressed}
 *                           holding assets (PNGs, woff2 fonts, runtime JS);
 * - `__bundler/page_order` — JSON array (empty for this deck).
 *
 * We only ever rewrite the template block; manifest and loader travel
 * untouched, so the repacked file keeps rendering/printing exactly like the
 * original export.
 *
 * Structure guard: a future Claude Design export may change this format.
 * `unpackBundle` fails LOUD with a precise message instead of no-op'ing —
 * that failure is the signal to revisit this module (story 30.2, AI 34-ish).
 */

const TEMPLATE_BLOCK_REGEX = /(<script type="__bundler\/template">)([\s\S]*?)(<\/script>)/

/** Thrown when the standalone bundle does not look like what we know. */
export class BundleStructureError extends Error {
  constructor(message: string) {
    super(`Mediakit bundle structure error: ${message}`)
    this.name = 'BundleStructureError'
  }
}

export interface UnpackedBundle {
  /** The deck page HTML (decoded from the template block). */
  deckHtml: string
}

/** Minimum deck shape we rely on — guards a silently-different export. */
function assertDeckShape(deckHtml: string): void {
  const sections = deckHtml.split('<section ').length - 1
  if (sections < 2) {
    throw new BundleStructureError(
      `decoded template has ${sections} <section> blocks — expected a multi-slide deck`
    )
  }
  if (!deckHtml.includes('data-label="Capa"')) {
    throw new BundleStructureError('decoded template has no slide with data-label="Capa"')
  }
}

export function unpackBundle(bundleHtml: string): UnpackedBundle {
  const match = bundleHtml.match(TEMPLATE_BLOCK_REGEX)
  if (!match) {
    throw new BundleStructureError(
      'no <script type="__bundler/template"> block found — is this a Claude Design standalone export?'
    )
  }

  let deckHtml: unknown
  try {
    deckHtml = JSON.parse(match[2])
  } catch {
    throw new BundleStructureError('template block is not valid JSON')
  }
  if (typeof deckHtml !== 'string') {
    throw new BundleStructureError(
      `template block decoded to ${typeof deckHtml} — expected a JSON string with the deck HTML`
    )
  }

  assertDeckShape(deckHtml)
  return { deckHtml }
}

/**
 * Replaces the deck HTML inside the bundle, leaving everything else
 * byte-identical. The new deck is validated with the same shape guard.
 */
export function repackBundle(bundleHtml: string, newDeckHtml: string): string {
  assertDeckShape(newDeckHtml)
  const match = bundleHtml.match(TEMPLATE_BLOCK_REGEX)
  if (!match) {
    throw new BundleStructureError('no template block found to repack into')
  }
  // `<\/` keeps any literal `</script>` inside the deck from terminating the
  // host <script> block early (same escaping the original export uses).
  const encoded = JSON.stringify(newDeckHtml).replace(/<\//g, '<\\/')
  return bundleHtml.replace(TEMPLATE_BLOCK_REGEX, () => `${match[1]}${encoded}${match[3]}`)
}
