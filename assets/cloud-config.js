// Label Workbench cloud runtime config.
// The Supabase project URL and publishable key are intentionally public client values.
// Security MUST come from Supabase Auth + Row Level Security (RLS).
// NEVER place service_role / secret keys in this repository or browser code.
window.LABEL_WORKBENCH_CLOUD = {
  provider: 'supabase',
  url: 'https://kjbyyewytqgqacrxdkru.supabase.co',
  key: 'sb_publishable_xHNHjHZxddpdEmSE606ktQ_9HP0H7UW',
  enabled: true
};

// Load the private attachment add-on separately so the core app can stay local-first.
(function loadAttachmentAddon(){
  if (document.querySelector('script[data-label-attachments]')) return;
  const script = document.createElement('script');
  script.src = 'assets/cloud-attachments.js?v=0.7.0';
  script.dataset.labelAttachments = 'true';
  script.async = false;
  document.head.appendChild(script);
})();
