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

(function loadWorkbenchAddons(){
  const addons = [
    ['assets/cloud-attachments.js?v=0.7.0','labelAttachments'],
    ['assets/file-parsers.js?v=0.8.0','labelParsers']
  ];
  addons.forEach(([src,key]) => {
    if (document.querySelector(`script[data-${key}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.setAttribute(`data-${key}`, 'true');
    script.async = false;
    document.head.appendChild(script);
  });
})();
