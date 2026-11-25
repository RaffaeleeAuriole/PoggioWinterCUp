<?php
declare(strict_types=1);
require_once __DIR__.'/Supabase.php';
final class Auth {
  /** Permessi SEMPRE verificati qui, lato server: JWT valido + riga in admin_profiles. */
  public static function requireAdmin(Supabase $sb): array {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+([A-Za-z0-9\-_\.]+)$/', $h, $m)) throw new ApiException('Non autenticato', 401);
    $user = $sb->userFromJwt($m[1]);
    if (!$user) throw new ApiException('Sessione non valida', 401);
    $rows = $sb->rest('GET', 'admin_profiles', ['user_id'=>'eq.'.$user['id'], 'select'=>'user_id,display_name,role']);
    if (!$rows) throw new ApiException('Accesso riservato agli amministratori', 403);
    return $rows[0];
  }
}
