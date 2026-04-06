import { createHash, randomInt } from 'node:crypto';

const DEFAULT_KEYWORD = 'obfiowerehiring';
const ADDITIONAL_RANDOM_NUMBER = 3;
const HOME_URL = 'https://x.com/';
const ON_DEMAND_FILE_REGEX = /['"]ondemand\.s['"]\s*:\s*['"]([\w]+)['"]/;
const META_VERIFICATION_REGEX =
  /<meta[^>]+name=["']twitter-site-verification["'][^>]+content=["']([^"']+)["']/i;
const LOADING_ANIM_REGEX = /<svg[^>]+id=["']loading-x-anim-\d+["'][\s\S]*?<\/svg>/gi;
const PATH_REGEX = /<path[^>]+d=["']([^"']+)["']/gi;
const INDICES_REGEX = /\(\w\[(\d{1,2})\],\s*16\)/g;

interface TransactionState {
  keyBytes: number[];
  animationKey: string;
}

function floatToHex(x: number): string {
  const result: string[] = [];
  let quotient = Math.trunc(x);
  let fraction = x - quotient;

  while (quotient > 0) {
    const next = Math.trunc(x / 16);
    const remainder = Math.trunc(x - next * 16);
    result.unshift(remainder > 9 ? String.fromCharCode(remainder + 55) : String(remainder));
    x = next;
    quotient = Math.trunc(x);
  }

  if (result.length === 0) result.push('0');
  if (fraction === 0) return result.join('');

  result.push('.');
  let safety = 0;
  while (fraction > 0 && safety < 16) {
    fraction *= 16;
    const integer = Math.trunc(fraction);
    fraction -= integer;
    result.push(integer > 9 ? String.fromCharCode(integer + 55) : String(integer));
    safety += 1;
  }
  return result.join('');
}

function isOdd(num: number): number {
  return num % 2 ? -1 : 0;
}

function interpolate(from: number[], to: number[], value: number): number[] {
  return from.map((item, index) => item + (to[index] - item) * value);
}

function cubicBezierValue(curves: number[], t: number): number {
  const [p1x, p1y, p2x, p2y] = curves;
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const y = 3 * uu * t * p1y + 3 * u * tt * p2y + tt * t;
  const x = 3 * uu * t * p1x + 3 * u * tt * p2x + tt * t;
  if (x === 0) return y;
  return y;
}

function rotationMatrix(degrees: number): number[] {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [cos, sin, -sin, cos];
}

function extractVerificationKey(html: string): string {
  const match = META_VERIFICATION_REGEX.exec(html);
  if (!match?.[1]) throw new Error("Couldn't extract the twitter-site-verification key from x.com.");
  return match[1];
}

function extractOnDemandPath(html: string): string {
  const match = ON_DEMAND_FILE_REGEX.exec(html);
  if (!match?.[1]) throw new Error("Couldn't locate X's ondemand transaction script.");
  return `https://abs.twimg.com/responsive-web/client-web/ondemand.s.${match[1]}a.js`;
}

function extractIndices(script: string): { rowIndex: number; keyByteIndices: number[] } {
  const matches = Array.from(script.matchAll(INDICES_REGEX)).map((match) => Number(match[1]));
  if (matches.length < 2) throw new Error("Couldn't derive X transaction key indices.");
  return { rowIndex: matches[0], keyByteIndices: matches.slice(1) };
}

function extractFrames(html: string): string[] {
  const frames = Array.from(html.matchAll(LOADING_ANIM_REGEX)).map((match) => match[0]);
  if (frames.length === 0) throw new Error("Couldn't locate X loading animation frames for transaction ids.");
  return frames;
}

function parseFrameRows(frameHtml: string): number[][] {
  const pathMatches = Array.from(frameHtml.matchAll(PATH_REGEX)).map((match) => match[1]);
  const targetPath = pathMatches[1] ?? pathMatches[0];
  if (!targetPath) throw new Error("Couldn't parse an SVG path from the X loading animation.");
  return targetPath
    .slice(9)
    .split('C')
    .map((segment) => segment.replace(/[^\d]+/g, ' ').trim())
    .filter(Boolean)
    .map((segment) => segment.split(/\s+/).map((value) => Number(value)));
}

function solve(value: number, min: number, max: number, rounding: boolean): number {
  const result = (value * (max - min)) / 255 + min;
  return rounding ? Math.floor(result) : Math.round(result * 100) / 100;
}

function animate(frame: number[], targetTime: number): string {
  const fromColor = [...frame.slice(0, 3), 1].map(Number);
  const toColor = [...frame.slice(3, 6), 1].map(Number);
  const toRotation = [solve(frame[6], 60, 360, true)];
  const curves = frame.slice(7).map((value, index) => solve(value, isOdd(index), 1, false));
  const tween = cubicBezierValue(curves, targetTime);
  const color = interpolate(fromColor, toColor, tween).map((value) => (value > 0 ? value : 0));
  const matrix = rotationMatrix(interpolate([0], toRotation, tween)[0]);

  const parts = color.slice(0, -1).map((value) => Math.round(value).toString(16));
  for (const value of matrix) {
    const rounded = Math.abs(Math.round(value * 100) / 100);
    const hex = floatToHex(rounded).toLowerCase();
    parts.push(hex.startsWith('.') ? `0${hex}` : hex || '0');
  }
  parts.push('0', '0');
  return parts.join('').replace(/[.-]/g, '');
}

async function buildTransactionState(userAgent: string): Promise<TransactionState> {
  const homeResponse = await fetch(HOME_URL, {
    headers: {
      'user-agent': userAgent,
      'cache-control': 'no-cache',
      referer: HOME_URL,
    },
  });
  const homeHtml = await homeResponse.text();
  const key = extractVerificationKey(homeHtml);
  const keyBytes = Array.from(Buffer.from(key, 'base64'));
  const frames = extractFrames(homeHtml);
  const onDemandUrl = extractOnDemandPath(homeHtml);
  const script = await fetch(onDemandUrl, { headers: { 'user-agent': userAgent, referer: HOME_URL } }).then((r) => r.text());
  const { rowIndex, keyByteIndices } = extractIndices(script);

  const rows = parseFrameRows(frames[keyBytes[5] % frames.length]);
  const targetRow = rows[keyBytes[rowIndex] % 16];
  const frameTime = keyByteIndices
    .map((index) => keyBytes[index] % 16)
    .reduce((product, value) => product * value, 1);
  const animationKey = animate(targetRow, frameTime / 4096);
  return { keyBytes, animationKey };
}

export interface XClientTransactionIdGenerator {
  generate(method: string, path: string): Promise<string>;
}

export class XClientTransaction implements XClientTransactionIdGenerator {
  private statePromise?: Promise<TransactionState>;

  constructor(private readonly userAgent: string) {}

  private state(): Promise<TransactionState> {
    if (!this.statePromise) this.statePromise = buildTransactionState(this.userAgent);
    return this.statePromise;
  }

  async generate(method: string, path: string): Promise<string> {
    const state = await this.state();
    const timeNow = Math.floor((Date.now() - 1682924400 * 1000) / 1000);
    const timeBytes = [0, 1, 2, 3].map((index) => (timeNow >> (index * 8)) & 0xff);
    const hash = createHash('sha256')
      .update(`${method.toUpperCase()}!${path}!${timeNow}${DEFAULT_KEYWORD}${state.animationKey}`)
      .digest();
    const payload = [...state.keyBytes, ...timeBytes, ...Array.from(hash.subarray(0, 16)), ADDITIONAL_RANDOM_NUMBER];
    const mask = randomInt(0, 256);
    const out = Buffer.from([mask, ...payload.map((value) => value ^ mask)]);
    return out.toString('base64').replace(/=+$/g, '');
  }
}
