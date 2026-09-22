export class ConfigError extends Error {
  name = 'ConfigError';
}

/** Reads build-time configuration. Vite inlines `VITE_*` variables at build time. */
export function getConfig() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new ConfigError(
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. ' +
        'Copy .env.example to .env.local and fill in your Supabase project values.',
    );
  }
  return { supabaseUrl, supabaseKey };
}
