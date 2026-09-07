// Label Workbench cloud runtime config.
// The Supabase project URL and publishable/anon key are intentionally public client values.
// Security MUST come from Supabase Auth + Row Level Security (RLS).
// NEVER place service_role / secret keys in this repository or browser code.
window.LABEL_WORKBENCH_CLOUD = {
  provider: 'supabase',
  url: '',
  key: '',
  enabled: false
};
