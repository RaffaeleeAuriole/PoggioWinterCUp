<?php
// Copia in config/config.php (NON committare config.php). La service_role key resta solo qui, sul server.
return [
  'supabase_url'  => 'https://XXXX.supabase.co',
  'anon_key'      => 'eyJ...',
  'service_key'   => 'eyJ...',      // segreta: mai nel browser
  'allowed_origin'=> 'https://tuo-dominio.example',
  'check_token'   => 'cambiami',    // per tools/check_host.php
];
