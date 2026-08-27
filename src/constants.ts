/**
 * NSIGII — Constants & Binary Layout
 */

export const NSIGII_MAGIC = Buffer.from("NSIGII\0", "ascii");
/** File-terminating marker. A conformant .nsigii container ends with the ASCII
 *  bytes `ENDNSIGII` followed by the segment count and the final hash. */
export const NSIGII_FOOTER_MAGIC = Buffer.from("ENDNSIGII", "ascii");
/** Footer marker written by pre-0.1 builds; still accepted on read. */
export const NSIGII_FOOTER_MAGIC_LEGACY = Buffer.from("ENDSIGII", "ascii");
export const NSIGII_VERSION = "7.0.0" as const;

export const NSIGII_CHANNEL_TRANSMIT = 0;
export const NSIGII_CHANNEL_RECEIVE = 1;
export const NSIGII_CHANNEL_VERIFY = 2;

export const RWX_READ = 0b100;
export const RWX_WRITE = 0b010;
export const RWX_EXECUTE = 0b001;
export const RWX_FULL = 0b111;

export const CLASS_NOISE = 0x00;
export const CLASS_NONOISE = 0x01;
export const CLASS_SIGNAL = 0x02;
export const CLASS_NOSIGNAL = 0x03;

export const CONSENSUS_MAYBE = 0x10;
export const CONSENSUS_VERIFIED = 0xFF;
export const CONSENSUS_TAMPERED = 0xEE;

export const HR_NONE = 0x00;
export const HR_TRANSMIT = 0x01;
export const HR_RECEIVE = 0x02;
export const HR_VERIFY = 0x03;
export const HR_ARCHIVE = 0x04;
export const HR_EVIDENCE = 0x05;
