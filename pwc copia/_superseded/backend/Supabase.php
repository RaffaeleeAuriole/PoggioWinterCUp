<?php
declare(strict_types=1);
require_once __DIR__.'/Response.php';
final class Supabase {
  public function __construct(private array $c) {}
  private function call(string $method, string $path, string $key, ?string $body = null, array $headers = []): array {
    $ch = curl_init($this->c['supabase_url'].$path);
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST=>$method, CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>15, CURLOPT_SSL_VERIFYPEER=>true,
      CURLOPT_HTTPHEADER=>array_merge(['apikey: '.$this->c['anon_key'], 'Authorization: Bearer '.$key], $headers)]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $raw = curl_exec($ch);
    if ($raw === false) { $e = curl_error($ch); curl_close($ch); throw new ApiException('Connessione a Supabase fallita: '.$e, 502); }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$status, $raw === '' ? null : json_decode($raw, true)];
  }
  /** Lettura/scrittura tabelle con service_role (solo dopo controllo admin lato PHP). */
  public function rest(string $method, string $table, array $query = [], ?array $body = null): mixed {
    $path = '/rest/v1/'.$table.($query ? '?'.http_build_query($query) : '');
    [$s,$d] = $this->call($method, $path, $this->c['service_key'], $body === null ? null : json_encode($body), ['Content-Type: application/json','Prefer: return=representation']);
    if ($s >= 400) throw new ApiException($d['message'] ?? 'Errore database', $s >= 500 ? 502 : 400);
    return $d;
  }
  public function rpc(string $fn, array $args): mixed {
    [$s,$d] = $this->call('POST', '/rest/v1/rpc/'.$fn, $this->c['service_key'], json_encode($args), ['Content-Type: application/json']);
    if ($s >= 400) throw new ApiException($d['message'] ?? 'Errore database', $s >= 500 ? 502 : 400);
    return $d;
  }
  /** Verifica il JWT con Supabase Auth: restituisce l'utente o null. */
  public function userFromJwt(string $jwt): ?array {
    [$s,$d] = $this->call('GET', '/auth/v1/user', $jwt);
    return ($s === 200 && isset($d['id'])) ? $d : null;
  }
  /** Upload immagine nel bucket 'media' (il MIME e' verificato dal contenuto, non dal nome). */
  public function uploadImage(string $objectPath, string $tmpFile): string {
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmpFile);
    $ext = ['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'][$mime] ?? null;
    if (!$ext) throw new ApiException('Formato non consentito (solo JPG, PNG, WEBP)', 415);
    if (filesize($tmpFile) > 5*1024*1024) throw new ApiException('File troppo grande (max 5 MB)', 413);
    $name = trim($objectPath,'/').'/'.bin2hex(random_bytes(12)).'.'.$ext;
    [$s,] = $this->call('POST', '/storage/v1/object/media/'.$name, $this->c['service_key'], file_get_contents($tmpFile), ['Content-Type: '.$mime]);
    if ($s >= 400) throw new ApiException('Upload non riuscito', 502);
    return $name;
  }
}
