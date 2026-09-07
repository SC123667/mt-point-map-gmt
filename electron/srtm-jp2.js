const fs = require("fs");
let codecPromise;

// Only the lossless, signed 16-bit single-band SRTM layout is accepted.
// Extract its codestream because the OpenJPEG JS wrapper expects J2K, not JP2.
function jp2Codestream(bytes) {
  if (bytes.length < 12 || bytes.toString("hex", 0, 12) !== "0000000c6a5020200d0a870a") {
    throw new Error("下载内容不是有效的 SRTM JP2 文件。");
  }
  for (let offset = 0; offset + 8 <= bytes.length;) {
    let length = bytes.readUInt32BE(offset);
    let header = 8;
    if (length === 1) {
      if (offset + 16 > bytes.length) break;
      const extended = bytes.readBigUInt64BE(offset + 8);
      if (extended > BigInt(bytes.length)) break;
      length = Number(extended);
      header = 16;
    } else if (length === 0) length = bytes.length - offset;
    if (length < header || offset + length > bytes.length) break;
    if (bytes.toString("ascii", offset + 4, offset + 8) === "jp2c") {
      return bytes.subarray(offset + header, offset + length);
    }
    offset += length;
  }
  throw new Error("SRTM JP2 文件不完整或缺少高程数据。");
}

function validateSrtmHeader(data) {
  if (data.length < 45 || data.readUInt32BE(0) !== 0xff4fff51) throw new Error("SRTM JPEG2000 数据头无效。");
  const width = data.readUInt32BE(8) - data.readUInt32BE(16);
  const height = data.readUInt32BE(12) - data.readUInt32BE(20);
  if (width < 2 || height < 2 || width > 3601 || height > 3601 || width !== height ||
      data.readUInt16BE(40) !== 1 || data[42] !== 0x8f || data[43] !== 1 || data[44] !== 1) {
    throw new Error("SRTM JP2 必须为不超过 3601×3601 的单波段有符号 16 位高程。");
  }
  return { width, height };
}

async function decodeSrtmJp2(bytes) {
  const data = jp2Codestream(bytes);
  const { width, height } = validateSrtmHeader(data);
  if (!codecPromise) {
    const factory = require("@cornerstonejs/codec-openjpeg/decodewasmjs");
    // Explicit bytes also work from Electron ASAR, with no CDN or native addon.
    codecPromise = factory({
      wasmBinary: fs.readFileSync(require.resolve("@cornerstonejs/codec-openjpeg/decodewasm")),
      print: () => {}, printErr: () => {}
    });
  }
  const codec = await codecPromise;
  const decoder = new codec.J2KDecoder();
  try {
    decoder.getEncodedBuffer(data.length).set(data);
    decoder.decode();
    const info = decoder.getFrameInfo();
    const decoded = decoder.getDecodedBuffer();
    if (info.width !== width || info.height !== height || info.bitsPerSample !== 16 ||
        !info.isSigned || info.componentCount !== 1 || decoded.length !== width * height * 2) {
      throw new Error("SRTM JP2 解码后的高程尺寸或位深异常。");
    }
    // WASM is little-endian; HGT stores signed elevations in big-endian order.
    return Buffer.from(decoded).swap16();
  } finally {
    decoder.delete();
  }
}

module.exports = { decodeSrtmJp2, jp2Codestream, validateSrtmHeader };
