import { describe, expect, it } from "vitest";
import { bytesToHex } from "../src/hex.ts";
import { rlpEncode } from "../src/rlp.ts";
import { addressFromPrivateKey, signingHash, signLegacyTx, toChecksumAddress } from "../src/tx.ts";

// The worked example in the EIP-155 specification (https://eips.ethereum.org/EIPS/eip-155).
const KEY = "0x4646464646464646464646464646464646464646464646464646464646464646";
const TX = { nonce: 9n, gasPrice: 20_000_000_000n, gasLimit: 21000n, to: "0x3535353535353535353535353535353535353535", value: 10n ** 18n, data: "0x", chainId: 1n };

describe("EIP-155 signing", () => {
  it("produces the specification's signing hash", () => {
    expect(bytesToHex(signingHash(TX))).toBe("0xdaf5a779ae972f972197303d7b574746c7ef83eadac0f2791ad23db92e4c8e53");
  });
  it("produces the specification's signed transaction", () => {
    expect(signLegacyTx(TX, KEY).raw).toBe(
      "0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83",
    );
  });
  it("derives the address for the specification's key", () => {
    expect(addressFromPrivateKey(KEY)).toBe("0x9d8A62f656a8d1615C1294fd71e9CFb3E4855A4F");
  });
  it("uses chain ID 56 in v for BSC (v = recovery + 56*2 + 35)", () => {
    const signed = signLegacyTx({ ...TX, chainId: 56n }, KEY);
    const vByte = parseInt(signed.raw.slice(-134, -132), 16);
    expect([147, 148]).toContain(vByte);
  });
});

describe("RLP", () => {
  it("encodes the yellow-paper examples", () => {
    const b = (s: string) => new TextEncoder().encode(s);
    expect(bytesToHex(rlpEncode(b("dog")))).toBe("0x83646f67");
    expect(bytesToHex(rlpEncode([b("cat"), b("dog")]))).toBe("0xc88363617483646f67");
    expect(bytesToHex(rlpEncode(new Uint8Array(0)))).toBe("0x80");
    expect(bytesToHex(rlpEncode([]))).toBe("0xc0");
    expect(bytesToHex(rlpEncode(Uint8Array.of(0x0f)))).toBe("0x0f");
    expect(bytesToHex(rlpEncode(b("a".repeat(56))))).toBe("0xb838" + "61".repeat(56));
  });
});

describe("EIP-55 checksum", () => {
  it("matches the specification's examples", () => {
    for (const a of ["0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359", "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB"]) {
      expect(toChecksumAddress(a.toLowerCase())).toBe(a);
    }
  });
});
