// Crypto helpers built on the runtime's Web Crypto (crypto.subtle) — no libs.
//   - sign/verify (HMAC-SHA256): tamper-proofs the short-lived OAuth `state`.
//   - encryptJSON/decryptJSON (AES-256-GCM): encrypts the session cookie so the
//     GitHub token it carries is never readable, even as an opaque cookie value.
// Both derive their key from env.SESSION_SECRET (a long random string).

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str: string): Uint8Array {
  const norm = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(norm)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

// value -> "value.signature" (signature is base64url).
export async function sign(value: string, secret: string): Promise<string> {
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value))
  return `${value}.${b64urlEncode(new Uint8Array(sig))}`
}

// Returns the original value if the signature is valid, else null.
export async function verify(signed: string, secret: string): Promise<string | null> {
  const i = signed.lastIndexOf('.')
  if (i === -1) return null
  const value = signed.slice(0, i)
  const key = await hmacKey(secret)
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    b64urlDecode(signed.slice(i + 1)),
    enc.encode(value),
  )
  return ok ? value : null
}

// Constant-time string comparison, so how long a mismatch takes to reject says
// nothing about how much of the value was right.
export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a)
  const y = enc.encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(secret))
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

// obj -> base64url(iv ‖ ciphertext). A fresh 12-byte IV per call.
export async function encryptJSON(obj: unknown, secret: string): Promise<string> {
  const key = await aesKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(obj)),
  )
  const packed = new Uint8Array(iv.length + ct.byteLength)
  packed.set(iv, 0)
  packed.set(new Uint8Array(ct), iv.length)
  return b64urlEncode(packed)
}

// Inverse of encryptJSON. Returns null on any tamper/format/decrypt failure.
export async function decryptJSON<T = unknown>(
  token: string,
  secret: string,
): Promise<T | null> {
  try {
    const packed = b64urlDecode(token)
    const iv = packed.slice(0, 12)
    const ct = packed.slice(12)
    const key = await aesKey(secret)
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
    return JSON.parse(dec.decode(pt)) as T
  } catch {
    return null
  }
}
