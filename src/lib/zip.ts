import { inflateRawSync } from "zlib";

// 파일 하나만 든 zip 의 내용을 꺼낸다. 로컬 헤더 크기가 0이면 중앙 디렉터리 값을 쓴다
export function unzipFirst(buf: Buffer): Buffer {
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error("zip: bad header");
  const method = buf.readUInt16LE(8);
  let size = buf.readUInt32LE(18);
  const start = 30 + buf.readUInt16LE(26) + buf.readUInt16LE(28);
  if (!size) {
    const cd = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    if (cd < 0) throw new Error("zip: no central dir");
    size = buf.readUInt32LE(cd + 20);
  }
  const data = buf.subarray(start, start + size);
  return method === 0 ? data : inflateRawSync(data);
}
