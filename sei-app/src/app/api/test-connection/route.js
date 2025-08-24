// API endpoint to test frontend-backend connection
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Test connection to sei-so backend
    const response = await fetch('http://localhost:3001/api/drone/info', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        status: 'connected',
        message: 'Backend connection successful',
        backendData: data,
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error(`Backend responded with status: ${response.status}`);
    }
    
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: 'Could not connect to backend',
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
}
