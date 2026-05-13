export interface Topology { transmit: boolean; receive: boolean; verify: boolean; }
export function isComplete(t: Topology): boolean { return t.transmit && t.receive && t.verify; }
