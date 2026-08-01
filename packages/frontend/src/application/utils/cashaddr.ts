const CASHADDR_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
const HASH_SIZE_TO_BITS: Record<number, number> = {
  20: 0,
  24: 1,
  28: 2,
  32: 3,
  40: 4,
  48: 5,
  56: 6,
  64: 7,
};

function polymod(values: number[]): bigint {
  let chk = 1n;
  for (const value of values) {
    const top = chk >> 35n;
    chk = ((chk & 0x07ffffffffn) << 5n) ^ BigInt(value);
    for (let i = 0; i < 5; i++) {
      if (((top >> BigInt(i)) & 1n) !== 0n) {
        chk ^= GENERATOR[i];
      }
    }
  }
  return chk ^ 1n;
}

function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const maxValue = (1 << toBits) - 1;
  const result: number[] = [];
  for (const value of data) {
    if ((value >>> fromBits) !== 0) {
      throw new Error('Invalid data group');
    }
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >>> bits) & maxValue);
    }
  }
  if (pad) {
    if (bits > 0) {
      result.push((acc << (toBits - bits)) & maxValue);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxValue) !== 0) {
    throw new Error('Invalid padding');
  }
  return result;
}

function prefixExpand(prefix: string): number[] {
  const values: number[] = [];
  for (const char of prefix) {
    values.push(char.charCodeAt(0) & 0x1f);
  }
  values.push(0);
  return values;
}

export function encodeCashaddr(prefix: string, hash: Uint8Array, type = 0): string {
  const sizeBits = HASH_SIZE_TO_BITS[hash.length];
  if (sizeBits === undefined) {
    throw new Error(`Unsupported cashaddr hash size: ${hash.length}`);
  }
  const payload = convertBits([(type << 3) | sizeBits, ...Array.from(hash)], 8, 5, true);
  const mod = polymod([...prefixExpand(prefix), ...payload, ...Array(8).fill(0)]);
  const checksum: number[] = [];
  for (let i = 0; i < 8; i++) {
    checksum.push(Number((mod >> BigInt(5 * (7 - i))) & 31n));
  }
  const all = [...payload, ...checksum];
  return `${prefix}:${all.map((v) => CASHADDR_CHARSET[v]).join('')}`;
}

export function decodeCashaddr(address: string): { prefix: string; hash: Uint8Array; type: number } {
  const hasUpper = /[A-Z]/.test(address);
  const hasLower = /[a-z]/.test(address);
  if (hasUpper && hasLower) {
    throw new Error('Mixed case cashaddr addresses are not allowed');
  }
  const normalized = address.toLowerCase();
  const separator = normalized.lastIndexOf(':');
  const prefix = separator >= 0 ? normalized.slice(0, separator) : 'bitcoincash';
  const payload = separator >= 0 ? normalized.slice(separator + 1) : normalized;
  const data: number[] = [];
  for (const char of payload) {
    const index = CASHADDR_CHARSET.indexOf(char);
    if (index < 0) {
      throw new Error(`Invalid cashaddr character: ${char}`);
    }
    data.push(index);
  }
  const verification = polymod([...prefixExpand(prefix), ...data]);
  if (verification !== 0n) {
    throw new Error('Invalid cashaddr checksum');
  }
  const bytes = convertBits(data.slice(0, data.length - 8), 5, 8, false);
  if (bytes.length < 21) {
    throw new Error('Invalid cashaddr payload');
  }
  const versionByte = bytes[0];
  return {
    prefix,
    type: versionByte >> 3,
    hash: Uint8Array.from(bytes.slice(1, 21)),
  };
}

export function addressToPkhHex(address: string): string {
  return bytesToHex(decodeCashaddr(address).hash);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/, '');
  if (clean.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
