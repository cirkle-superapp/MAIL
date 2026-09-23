/**
 * source-type.ts
 * -----------------------------------------------------------------------------
 * Single source-of-truth for source-type → CIRKLE color mapping + metadata.
 *
 * CIRKLE brand palette (gold / deep teal / rose / steel / charcoal / cream):
 *   OFFICIAL    → teal      (deep teal — primary brand color)
 *   GOVERNMENT  → charcoal  (charcoal — institutional / dark)
 *   ACADEMIC    → steel     (steel blue — scholarly)
 *   NEWS        → rose     (rose — news / urgent)
 *   COMMUNITY   → gold      (gold — community / warm)
 *   COMMERCIAL  → gold      (gold — commercial / money)
 *   PRIMARY     → teal      (deep teal — authoritative source)
 *   WEB         → muted     (neutral — general)
 *
 * These tokens are used by ResultCard badges, FilterPanel dots, and
 * SourceProfileDialog badges.
 */

import type { SourceType } from './types'

export interface SourceTypeStyle {
  /** Tailwind classes for a small filled badge (bg + text + border). */
  badge: string
  /** Tailwind class for a tiny dot indicator. */
  dot: string
  /** Tailwind class for the favicon-style dot used in ResultCard top line. */
  favicon: string
  /** Human-readable label. */
  label: string
  /** Short description shown in tooltips. */
  description: string
}

export const SOURCE_TYPE_STYLES: Record<string, SourceTypeStyle> = {
  OFFICIAL: {
    badge: 'bg-teal/10 text-teal border-teal/30',
    dot: 'bg-teal',
    favicon: 'bg-teal',
    label: 'Official',
    description: 'Official documentation, vendor / project sources.',
  },
  GOVERNMENT: {
    badge: 'bg-charcoal/10 text-charcoal border-charcoal/30',
    dot: 'bg-charcoal',
    favicon: 'bg-charcoal',
    label: 'Government',
    description: 'Government / regulator / public-sector sources.',
  },
  ACADEMIC: {
    badge: 'bg-steel/10 text-steel border-steel/30',
    dot: 'bg-steel',
    favicon: 'bg-steel',
    label: 'Academic',
    description: 'Peer-reviewed papers, university / scholarly sources.',
  },
  NEWS: {
    badge: 'bg-rose/10 text-rose border-rose/30',
    dot: 'bg-rose',
    favicon: 'bg-rose',
    label: 'News',
    description: 'News media coverage of current events.',
  },
  COMMUNITY: {
    badge: 'bg-gold/15 text-gold border-gold/40',
    dot: 'bg-gold',
    favicon: 'bg-gold',
    label: 'Community',
    description: 'Community discussion (forums, Q&A).',
  },
  COMMERCIAL: {
    badge: 'bg-gold/15 text-gold border-gold/40',
    dot: 'bg-gold',
    favicon: 'bg-gold',
    label: 'Commercial',
    description: 'Commercial / product / e-commerce sources.',
  },
  PRIMARY: {
    badge: 'bg-teal/15 text-teal border-teal/40',
    dot: 'bg-teal',
    favicon: 'bg-teal',
    label: 'Primary',
    description: 'Primary source (original report / filing / dataset).',
  },
  WEB: {
    badge: 'bg-muted text-muted-foreground border-border',
    dot: 'bg-muted-foreground/50',
    favicon: 'bg-muted-foreground/50',
    label: 'Web',
    description: 'General web content.',
  },
}

export function sourceTypeStyle(t: string | undefined | null): SourceTypeStyle {
  if (t && SOURCE_TYPE_STYLES[t]) return SOURCE_TYPE_STYLES[t]
  return SOURCE_TYPE_STYLES.WEB
}

export const ALL_SOURCE_TYPES: SourceType[] = [
  'OFFICIAL',
  'GOVERNMENT',
  'ACADEMIC',
  'NEWS',
  'COMMUNITY',
  'COMMERCIAL',
  'PRIMARY',
  'WEB',
]
