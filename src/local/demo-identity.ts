// The presenter's identity in local demo mode: an ES256 key pair generated on this machine.
// The private key stays in .env.local and this server process; the backend only receives the public JWKS.
import { LOCAL_DEMO_AUDIENCE, LOCAL_DEMO_ISSUER } from "../domain/local-demo";

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const json64 = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

export async function generateDemoKeys(): Promise<{ privateJwk: string; jwksDataUri: string }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const kid = b64url(crypto.getRandomValues(new Uint8Array(9)));
  const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const jwks = { keys: [{ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y, kid, alg: "ES256", use: "sig" }] };
  return {
    privateJwk: JSON.stringify({ ...priv, kid }),
    jwksDataUri: `data:text/plain;charset=utf-8;base64,${btoa(JSON.stringify(jwks))}`,
  };
}

/** A short-lived token the demo backend accepts for one demo staff member (local demo unless `claims` says otherwise). */
export async function mintDemoToken(
  privateJwk: string,
  who: { subject: string; name: string; email?: string },
  ttlSeconds = 3600,
  claims: { issuer: string; audience: string } = { issuer: LOCAL_DEMO_ISSUER, audience: LOCAL_DEMO_AUDIENCE },
): Promise<{ token: string; expiresAt: number }> {
  const jwk = JSON.parse(privateJwk) as JsonWebKey & { kid?: string };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", typ: "JWT", ...(jwk.kid ? { kid: jwk.kid } : {}) };
  const payload = { iss: claims.issuer, aud: claims.audience, sub: who.subject, name: who.name, ...(who.email ? { email: who.email } : {}), iat: now, nbf: now - 5, exp: now + ttlSeconds };
  const input = `${json64(header)}.${json64(payload)}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input)));
  return { token: `${input}.${b64url(signature)}`, expiresAt: (now + ttlSeconds) * 1000 };
}
