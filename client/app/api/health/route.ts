import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Simple health check - if this endpoint responds, the Next.js app is running
    return NextResponse.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'covo-client',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'covo-client',
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
