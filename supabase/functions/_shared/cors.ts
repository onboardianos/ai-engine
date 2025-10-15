// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
];

// Regex patterns for dynamic origins (StackBlitz, WebContainer, etc.)
const ALLOWED_ORIGIN_PATTERNS = [
  /\.webcontainer-api\.io$/,
  /\.stackblitz\.io$/,
  /\.bolt\.new$/,
];

export function corsHeaders(origin: string | null) {
  // Determine if origin is allowed
  let allowOrigin = '*';

  if (origin) {
    // Check exact matches
    if (ALLOWED_ORIGINS.includes(origin)) {
      allowOrigin = origin;
    } else {
      // Check pattern matches
      for (const pattern of ALLOWED_ORIGIN_PATTERNS) {
        if (pattern.test(origin)) {
          allowOrigin = origin;
          break;
        }
      }
    }
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": [
      "authorization",
      "apikey",
      "content-type",
      "x-client-info",  // Required by @supabase/supabase-js
    ].join(", "),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

