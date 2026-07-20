/**
 * Shared path + markers for `/configure-repo-maps` (mirrors Platform DNA).
 * Thin Processkit copy yields to DNA SSOT when that skill is already installed.
 */

export const CONFIGURE_REPO_MAPS_REL = '.cursor/skills/configure-repo-maps/SKILL.md'
export const CROSS_REPO_INDEX_REL = '.cursor/rules/cross-repo-index.mdc'

const DNA_SSOT_MARKER = '<!-- platform-dna:configure-repo-maps-ssot -->'
const THIN_MARKER = '<!-- toolkit:configure-repo-maps-thin -->'

export function isDnaConfigureRepoMapsSsot(content: string): boolean {
  return content.includes(DNA_SSOT_MARKER)
}

export function isVendorThinConfigureRepoMaps(content: string): boolean {
  return content.includes(THIN_MARKER)
}

/** DNA owns the shared alwaysApply routing rule filename. */
export function isDnaCrossRepoIndexSsot(content: string): boolean {
  return /\*\*Owner:\*\*\s*Platform DNA/i.test(content)
}
