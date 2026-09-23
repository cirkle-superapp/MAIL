/**
 * diversity.ts
 * -----------------------------------------------------------------------------
 * Result diversity (§12). Prevent one site or one content cluster from
 * dominating. Default: max 2 results per domain WHEN meaningful alternatives
 * exist.
 *
 * We walk ranked list in order. For each candidate:
 *   - If the domain has already maxPerDomain results shown, suppress it
 *     (add to suppressed list AND to a cluster with the primary id).
 *   - Same for clusterId — one primary per cluster, with a "N more from this
 *     cluster" link.
 *   - If we'd suppress and there are < 2 distinct domains remaining in the
 *     tail, we DON'T suppress (don't artificially hide results).
 *
 * Returns: kept ids, suppressed ids, and clusters.
 * -----------------------------------------------------------------------------
 */

export interface DiversityCluster {
  id: string
  primaryId: string
  size: number
  suppressedIds: string[]
}

export interface DiversityResult {
  kept: string[]
  suppressed: string[]
  clusters: DiversityCluster[]
}

interface DiversityDocRow {
  id: string
  domain: string
  clusterId: string | null
}

export function applyDiversity(
  rankedDocIds: string[],
  dbDocs: Map<string, DiversityDocRow>,
  maxPerDomain: number
): DiversityResult {
  const kept: string[] = []
  const suppressed: string[] = []
  const domainCounts = new Map<string, number>()
  const clusterMap = new Map<string, DiversityCluster>()

  // Precompute remaining distinct domains in tail.
  // For each index i, compute the number of distinct domains still in [i..end]
  // (excluding the suppressed ones up to i).
  const remainingDistinctDomains = new Array(rankedDocIds.length).fill(0)
  const seenFromTail = new Set<string>()
  for (let i = rankedDocIds.length - 1; i >= 0; i--) {
    const d = dbDocs.get(rankedDocIds[i])
    if (d) seenFromTail.add(d.domain)
    remainingDistinctDomains[i] = seenFromTail.size
  }

  for (let i = 0; i < rankedDocIds.length; i++) {
    const id = rankedDocIds[i]
    const doc = dbDocs.get(id)
    if (!doc) {
      kept.push(id) // safety: don't drop unknown ids
      continue
    }
    const dom = doc.domain
    const clusterId = doc.clusterId ?? ('solo-' + id)

    const domainCount = domainCounts.get(dom) ?? 0

    // Decision: suppress?
    let shouldSuppress = false

    if (maxPerDomain > 0 && domainCount >= maxPerDomain) {
      // Check if there are alternatives remaining
      // distinct domains in the tail (excluding already-kept domains over
      // their cap)
      if (remainingDistinctDomains[i] >= 2) {
        shouldSuppress = true
      }
    }

    if (shouldSuppress) {
      suppressed.push(id)
      // Add to cluster (even if it's the domain suppression — group by clusterId
      // so the UI can show "N more from this cluster")
      const cl = clusterMap.get(clusterId)
      if (cl) {
        cl.size++
        cl.suppressedIds.push(id)
      } else {
        // Cluster not yet created — promote this doc to primary even though it
        // is suppressed, to track the cluster for UI display.
        // Actually we want the FIRST occurrence as primary — find it.
        const primaryId = kept.find((k) => {
          const kd = dbDocs.get(k)
          return kd && (kd.clusterId ?? ('solo-' + k)) === clusterId
        }) ?? id
        clusterMap.set(clusterId, {
          id: clusterId,
          primaryId,
          size: primaryId === id ? 1 : 2,
          suppressedIds: primaryId === id ? [] : [id],
        })
      }
    } else {
      kept.push(id)
      domainCounts.set(dom, domainCount + 1)
      // Register the cluster if not yet — primary = this doc.
      if (!clusterMap.has(clusterId)) {
        clusterMap.set(clusterId, {
          id: clusterId,
          primaryId: id,
          size: 1,
          suppressedIds: [],
        })
      } else {
        clusterMap.get(clusterId)!.size++
      }
    }
  }

  // Drop clusters that have no suppressed members (UI doesn't care about them)
  const clusters = Array.from(clusterMap.values()).filter(
    (c) => c.suppressedIds.length > 0
  )

  return { kept, suppressed, clusters }
}
