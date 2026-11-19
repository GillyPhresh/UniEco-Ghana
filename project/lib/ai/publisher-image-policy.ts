/** Preview controls are not reuse licenses. In particular, max-snippet:-1 is
 * unlimited text preview, not a ban on the article's images. */
export function blocksPublisherImagePreview(value: string) {
  return /\b(?:none|noindex|nosnippet|noimageindex)\b|\bmax-snippet\s*:\s*\d+|\bmax-image-preview\s*:\s*(?:none|standard)\b/i.test(value);
}
