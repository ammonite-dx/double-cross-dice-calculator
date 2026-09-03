export interface LatestValidationGate {
  begin(): number
  invalidate(): number
  canCommit(ticket: number): boolean
  dispose(): void
}

/**
 * Coordinates asynchronous validation callbacks. A ticket can commit only
 * while it is the newest ticket and the owning component is still mounted.
 */
export function createLatestValidationGate(): LatestValidationGate {
  let latestTicket = 0
  let disposed = false

  return {
    begin() {
      latestTicket += 1
      return latestTicket
    },
    invalidate() {
      latestTicket += 1
      return latestTicket
    },
    canCommit(ticket) {
      return !disposed && ticket === latestTicket
    },
    dispose() {
      disposed = true
      latestTicket += 1
    },
  }
}
