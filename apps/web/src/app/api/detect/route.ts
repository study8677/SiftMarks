import { NextResponse } from 'next/server';
import { detectChromeProfiles } from '@siftmarks/core';

export async function GET() {
  const profiles = detectChromeProfiles();
  return NextResponse.json({ profiles });
}
