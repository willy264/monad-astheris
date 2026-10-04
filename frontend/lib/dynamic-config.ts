// Dynamic Environment IDs are public SDK identifiers, not API keys.
// Default to Aetheris's sandbox project; other deployments can override at build time.
export const dynamicEnvironmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID?.trim()
  || '5ee665e4-6f64-43c1-9537-99d989371a80';
