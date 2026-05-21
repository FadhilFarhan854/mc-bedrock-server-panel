import { NextResponse } from 'next/server';
import { COOKIE_NAME, generateToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { password } = (await request.json()) as { password: string };

    if (!process.env.PANEL_PASSWORD) {
      return NextResponse.json(
        { error: 'PANEL_PASSWORD is not configured on the server.' },
        { status: 500 },
      );
    }

    if (password !== process.env.PANEL_PASSWORD) {
      return NextResponse.json({ error: 'Invalid password.' }, { status: 401 });
    }

    const token = await generateToken();
    const res = NextResponse.json({ success: true });

    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return res;
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
}
