export function adaptWasm(payload: Buffer): { module: boolean } { return { module: payload[0] === 0x00 && payload[1] === 0x61 }; }
