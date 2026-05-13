export function adaptText(payload: Buffer): { lines: number } { return { lines: payload.toString("utf8").split(/\r?\n/).length }; }
