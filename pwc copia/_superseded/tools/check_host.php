<?php
// Verifica REALE dell'hosting: carica questo file, aprilo con ?token=... poi CANCELLALO.
$cfg = is_file(__DIR__.'/../config/config.php') ? require __DIR__.'/../config/config.php' : null;
if (!$cfg || !hash_equals($cfg['check_token'], $_GET['token'] ?? '')) { http_response_code(403); exit('403'); }
header('Content-Type: text/plain; charset=utf-8');
echo 'PHP: '.PHP_VERSION.(version_compare(PHP_VERSION,'8.2','>=')?' OK':' TROPPO VECCHIO')."\n";
echo 'curl: '.(function_exists('curl_init')?'OK':'MANCA')."\n".'fileinfo: '.(class_exists('finfo')?'OK':'MANCA')."\n";
if (function_exists('curl_init')) {
  $ch = curl_init($cfg['supabase_url'].'/rest/v1/'); curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>10,CURLOPT_HTTPHEADER=>['apikey: '.$cfg['anon_key']]]);
  curl_exec($ch); echo 'HTTPS verso Supabase: '.(curl_errno($ch)?'FALLITO: '.curl_error($ch):'OK (HTTP '.curl_getinfo($ch,CURLINFO_HTTP_CODE).')')."\n";
}
echo 'upload_max_filesize: '.ini_get('upload_max_filesize')."\n";
