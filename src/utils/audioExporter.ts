import { Mp3Encoder } from "@breezystack/lamejs";

export type AcousticPresetId = "neutro" | "valvolare" | "broadcast" | "podcast";

export type ExportFormatId =
  | "wav-16"
  | "wav-24-48k"
  | "mp3-192"
  | "flac-16"
  | "webm-opus"
  | "prosody-json"
  | "prosody-txt";

export interface ExportFormatSpec {
  id: ExportFormatId;
  label: string;
  extension: string;
  codecDetails: string;
  description: string;
  category: "audio" | "script";
}

export const EXPORT_FORMATS: ExportFormatSpec[] = [
  {
    id: "wav-16",
    label: "WAV Studio Standard",
    extension: "wav",
    codecDetails: "24.0 kHz · 16-bit PCM · Mono",
    description: "Formato nativo non compresso, ideale per montaggio rapido e ascolto diretto.",
    category: "audio",
  },
  {
    id: "wav-24-48k",
    label: "WAV Broadcast Master HD",
    extension: "wav",
    codecDetails: "48.0 kHz · 24-bit PCM · Mono",
    description: "Ricampionato a 48 kHz con profondità 24-bit per cinema, TV e DAW professionali.",
    category: "audio",
  },
  {
    id: "mp3-192",
    label: "MP3 Alta Qualità",
    extension: "mp3",
    codecDetails: "192 kbps · MPEG Layer III",
    description: "Compresso universale ad alta resa per podcast, audiolibri, e-learning e condivisione.",
    category: "audio",
  },
  {
    id: "flac-16",
    label: "FLAC Lossless Archivio",
    extension: "flac",
    codecDetails: "24.0 kHz · 16-bit Lossless",
    description: "Archiviazione senza perdita di qualità con checksum CRC-16 integrato.",
    category: "audio",
  },
  {
    id: "webm-opus",
    label: "OGG / WebM Audio",
    extension: "webm",
    codecDetails: "Opus / WebM Container",
    description: "Formato leggero ottimizzato per distribuzione web e applicazioni moderne.",
    category: "audio",
  },
  {
    id: "prosody-txt",
    label: "Copione di Regia Annotato",
    extension: "txt",
    codecDetails: "Testo UTF-8 · Note Prosodiche",
    description: "Spartito leggibile con mappatura di virgole, pause in ms, toni e impostazione vocale.",
    category: "script",
  },
  {
    id: "prosody-json",
    label: "Dati Prosodici Strutturati",
    extension: "json",
    codecDetails: "JSON Schema · Time & Tone",
    description: "Struttura dati completa di analisi lessicale, accenti tonici e clausole per integrazioni.",
    category: "script",
  },
];

/**
 * Decodes base64 WAV string into an AudioBuffer and extracts waveform peaks.
 */
export async function decodeBase64Audio(
  base64Audio: string,
  numPeaks = 140
): Promise<{
  audioBuffer: AudioBuffer;
  peaks: number[];
}> {
  const binaryString = window.atob(base64Audio);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer.slice(0));
    const channelData = audioBuffer.getChannelData(0);
    const peaks = computeWaveformPeaks(channelData, numPeaks);
    return { audioBuffer, peaks };
  } finally {
    if (audioCtx.state !== "closed") {
      await audioCtx.close().catch(() => {});
    }
  }
}

export function computeWaveformPeaks(channelData: Float32Array, numPeaks = 140): number[] {
  const blockSize = Math.max(1, Math.floor(channelData.length / numPeaks));
  const peaks: number[] = [];

  for (let i = 0; i < numPeaks; i++) {
    const start = i * blockSize;
    let max = 0;
    for (let j = 0; j < blockSize && start + j < channelData.length; j++) {
      const val = Math.abs(channelData[start + j]);
      if (val > max) max = val;
    }
    peaks.push(Math.min(1, Math.max(0.04, max)));
  }

  // Normalize visual peaks for crisp studio display
  const highest = Math.max(...peaks, 0.1);
  return peaks.map((p) => Number(Math.max(0.05, Math.min(1, p / highest)).toFixed(3)));
}

/**
 * Applies studio acoustic EQ preset and optional target sample rate using OfflineAudioContext.
 */
export async function renderMasteredBuffer(
  sourceBuffer: AudioBuffer,
  preset: AcousticPresetId,
  targetSampleRate?: number
): Promise<AudioBuffer> {
  const sampleRate = targetSampleRate || sourceBuffer.sampleRate;
  const duration = sourceBuffer.duration;
  const frameCount = Math.max(1, Math.ceil(duration * sampleRate));

  const offlineCtx = new OfflineAudioContext(1, frameCount, sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;

  // High-pass subsonic cleanup at 75Hz
  const highpass = offlineCtx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 75;
  highpass.Q.value = 0.707;

  // Low-mid warmth body filter (220Hz)
  const lowShelf = offlineCtx.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 220;

  // Diction presence peak filter (3.2kHz)
  const presence = offlineCtx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 3200;
  presence.Q.value = 1.1;

  // Air shelf (9.5kHz)
  const highShelf = offlineCtx.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 9500;

  if (preset === "valvolare") {
    lowShelf.gain.value = 3.2;
    presence.gain.value = 0.8;
    highShelf.gain.value = -1.2;
  } else if (preset === "broadcast") {
    lowShelf.gain.value = 1.5;
    presence.gain.value = 3.0;
    highShelf.gain.value = 2.2;
  } else if (preset === "podcast") {
    lowShelf.gain.value = 2.6;
    presence.gain.value = 2.0;
    highShelf.gain.value = 1.0;
  } else {
    // Neutro Studio
    lowShelf.gain.value = 0;
    presence.gain.value = 0;
    highShelf.gain.value = 0;
  }

  source.connect(highpass);
  highpass.connect(lowShelf);
  lowShelf.connect(presence);
  presence.connect(highShelf);
  highShelf.connect(offlineCtx.destination);

  source.start(0);
  const rendered = await offlineCtx.startRendering();

  // Peak normalize to -1.0 dBFS (0.891 linear) so EQ boosts never clip
  const chan = rendered.getChannelData(0);
  let maxPeak = 0;
  for (let i = 0; i < chan.length; i++) {
    const abs = Math.abs(chan[i]);
    if (abs > maxPeak) maxPeak = abs;
  }
  if (maxPeak > 0.001) {
    const targetPeak = 0.891;
    const gain = targetPeak / maxPeak;
    for (let i = 0; i < chan.length; i++) {
      chan[i] = Math.max(-1, Math.min(1, chan[i] * gain));
    }
  }

  return rendered;
}

/**
 * Encodes an AudioBuffer to 16-bit or 24-bit PCM WAV Blob.
 */
export function encodeWavBlob(audioBuffer: AudioBuffer, bitDepth: 16 | 24 = 16): Blob {
  const samples = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = 1;
  const bytesPerSample = bitDepth / 8;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  if (bitDepth === 16) {
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(offset, Math.round(int16), true);
      offset += 2;
    }
  } else {
    // 24-bit signed little-endian PCM
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      const int24 = Math.round(s < 0 ? s * 8388608 : s * 8388607);
      view.setUint8(offset, int24 & 0xff);
      view.setUint8(offset + 1, (int24 >> 8) & 0xff);
      view.setUint8(offset + 2, (int24 >> 16) & 0xff);
      offset += 3;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Encodes an AudioBuffer to a real 192 kbps MP3 Blob using @breezystack/lamejs.
 */
export function encodeMp3Blob(audioBuffer: AudioBuffer, kbps = 192): Blob {
  const samples = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const int16Samples = new Int16Array(samples.length);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16Samples[i] = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
  }

  const mp3Encoder = new Mp3Encoder(1, sampleRate, kbps);
  const mp3Chunks: BlobPart[] = [];
  const sampleBlockSize = 1152;

  for (let i = 0; i < int16Samples.length; i += sampleBlockSize) {
    const chunk = int16Samples.subarray(i, i + sampleBlockSize);
    const mp3buf = mp3Encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) {
      mp3Chunks.push(new Uint8Array(mp3buf) as unknown as BlobPart);
    }
  }

  const endBuf = mp3Encoder.flush();
  if (endBuf.length > 0) {
    mp3Chunks.push(new Uint8Array(endBuf) as unknown as BlobPart);
  }

  return new Blob(mp3Chunks, { type: "audio/mpeg" });
}

/**
 * Pure TypeScript specification-compliant FLAC Lossless 16-bit Encoder.
 * Writes fLaC magic header, STREAMINFO metadata block, and VERBATIM subframes with CRC-8 & CRC-16.
 */
export function encodeFlacBlob(audioBuffer: AudioBuffer): Blob {
  const floatSamples = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const totalSamples = floatSamples.length;
  const blockSize = 4096;

  const int16Samples = new Int16Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const s = Math.max(-1, Math.min(1, floatSamples[i]));
    int16Samples[i] = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
  }

  const parts: BlobPart[] = [];

  // 1. "fLaC" stream marker + STREAMINFO metadata block (42 bytes total)
  const header = new Uint8Array(42);
  header[0] = 0x66; // 'f'
  header[1] = 0x4c; // 'L'
  header[2] = 0x61; // 'a'
  header[3] = 0x43; // 'C'
  header[4] = 0x80; // Last metadata block = 1, type = 0 (STREAMINFO)
  header[5] = 0x00;
  header[6] = 0x00;
  header[7] = 0x22; // Length = 34 bytes

  // minBlockSize (16 bits) = 4096, maxBlockSize (16 bits) = 4096
  header[8] = (blockSize >> 8) & 0xff;
  header[9] = blockSize & 0xff;
  header[10] = (blockSize >> 8) & 0xff;
  header[11] = blockSize & 0xff;
  // minFrameSize (24 bits) = 0, maxFrameSize (24 bits) = 0 -> bytes 12..17 are 0

  // sampleRate (20 bits), channels-1 (3 bits = 0), bitsPerSample-1 (5 bits = 15), totalSamples (36 bits)
  // Byte 18..25 (8 bytes = 64 bits)
  header[18] = (sampleRate >> 12) & 0xff;
  header[19] = (sampleRate >> 4) & 0xff;
  const channelsMinus1 = 0; // mono
  const bpsMinus1 = 15; // 16-bit
  header[20] = ((sampleRate & 0x0f) << 4) | ((channelsMinus1 & 0x07) << 1) | ((bpsMinus1 >> 4) & 0x01);
  const totalSamplesHigh4 = Math.floor(totalSamples / 0x100000000) & 0x0f;
  header[21] = ((bpsMinus1 & 0x0f) << 4) | totalSamplesHigh4;
  header[22] = (totalSamples >>> 24) & 0xff;
  header[23] = (totalSamples >>> 16) & 0xff;
  header[24] = (totalSamples >>> 8) & 0xff;
  header[25] = totalSamples & 0xff;
  // Bytes 26..41: 16-byte MD5 (zeros allowed per FLAC spec)
  parts.push(header);

  // 2. Encode frames of up to 4096 samples using VERBATIM subframes
  let frameNumber = 0;
  for (let offset = 0; offset < totalSamples; offset += blockSize) {
    const n = Math.min(blockSize, totalSamples - offset);
    const utf8FrameNum = encodeFlacUtf8Int(frameNumber);

    // Frame header:
    // [0..1] 0xFF, 0xF8 (sync code + fixed-blocksize strategy)
    // [2] 0x60 (block size = 0110 -> 16-bit (n-1) at end of header; sample rate = 0000 -> get from STREAMINFO)
    // [3] 0x08 (channel assignment = 0000 mono; sample size = 100 -> 16-bit; reserved = 0)
    // [4..4+utf8.length-1] frameNumber
    // [next 2 bytes] (n - 1) as 16-bit big endian
    // [last byte] CRC-8 of frame header
    const frameHeaderLen = 4 + utf8FrameNum.length + 2 + 1;
    const subframeLen = 1 + n * 2; // 1 byte subframe header (0x02 = VERBATIM) + n * 2 bytes PCM BE
    const frameBytes = new Uint8Array(frameHeaderLen + subframeLen + 2); // +2 for CRC-16 footer

    frameBytes[0] = 0xff;
    frameBytes[1] = 0xf8;
    frameBytes[2] = 0x60;
    frameBytes[3] = 0x08;
    frameBytes.set(utf8FrameNum, 4);
    const bsOffset = 4 + utf8FrameNum.length;
    frameBytes[bsOffset] = ((n - 1) >> 8) & 0xff;
    frameBytes[bsOffset + 1] = (n - 1) & 0xff;
    frameBytes[bsOffset + 2] = computeFlacCrc8(frameBytes, bsOffset + 2);

    // Subframe header: 0 (zero bit) + 000001 (VERBATIM) + 0 (no wasted bits) = 0x02
    let p = frameHeaderLen;
    frameBytes[p++] = 0x02;

    for (let i = 0; i < n; i++) {
      const val = int16Samples[offset + i];
      frameBytes[p++] = (val >> 8) & 0xff;
      frameBytes[p++] = val & 0xff;
    }

    const crc16 = computeFlacCrc16(frameBytes, p);
    frameBytes[p++] = (crc16 >> 8) & 0xff;
    frameBytes[p++] = crc16 & 0xff;

    parts.push(frameBytes);
    frameNumber++;
  }

  return new Blob(parts, { type: "audio/flac" });
}

/**
 * Encodes an AudioBuffer into an OGG/WebM Opus stream via MediaRecorder if supported,
 * with instant WAV fallback if browser MediaRecorder is unavailable.
 */
export async function encodeWebmOpusBlob(audioBuffer: AudioBuffer): Promise<{ blob: Blob; ext: string }> {
  if (typeof MediaRecorder === "undefined") {
    return { blob: encodeWavBlob(audioBuffer, 16), ext: "wav" };
  }

  const mimeTypes = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"];
  const supportedMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m));
  if (!supportedMime) {
    return { blob: encodeWavBlob(audioBuffer, 16), ext: "wav" };
  }

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    const dest = audioCtx.createMediaStreamDestination();
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(dest);

    const recorder = new MediaRecorder(dest.stream, { mimeType: supportedMime });
    const chunks: BlobPart[] = [];

    return await new Promise<{ blob: Blob; ext: string }>((resolve) => {
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const ext = supportedMime.includes("ogg") ? "ogg" : "webm";
        resolve({ blob: new Blob(chunks, { type: supportedMime }), ext });
      };
      recorder.start();
      source.start(0);
      source.onended = () => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      };
    });
  } finally {
    if (audioCtx.state !== "closed") {
      await audioCtx.close().catch(() => {});
    }
  }
}

function encodeFlacUtf8Int(val: number): Uint8Array {
  if (val < 0x80) return new Uint8Array([val]);
  if (val < 0x800) {
    return new Uint8Array([0xc0 | (val >> 6), 0x80 | (val & 0x3f)]);
  }
  if (val < 0x10000) {
    return new Uint8Array([0xe0 | (val >> 12), 0x80 | ((val >> 6) & 0x3f), 0x80 | (val & 0x3f)]);
  }
  return new Uint8Array([
    0xf0 | (val >> 18),
    0x80 | ((val >> 12) & 0x3f),
    0x80 | ((val >> 6) & 0x3f),
    0x80 | (val & 0x3f),
  ]);
}

function computeFlacCrc8(data: Uint8Array, length: number): number {
  let crc = 0;
  for (let i = 0; i < length; i++) {
    crc ^= data[i];
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

function computeFlacCrc16(data: Uint8Array, length: number): number {
  let crc = 0;
  for (let i = 0; i < length; i++) {
    crc ^= data[i] << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x8005) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function writeAscii(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
