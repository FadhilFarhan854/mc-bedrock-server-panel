export const COOKIE_NAME = 'panel_session';

async function hmac(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function generateToken(): Promise<string> {
  const password = process.env.PANEL_PASSWORD ?? '';
  const secret = (process.env.PANEL_SECRET ?? password) || 'changeme';
  return hmac(secret, password);
}

export async function validateToken(token: string): Promise<boolean> {
  if (!token) return false;
  const expected = await generateToken();
  return token === expected;
}
