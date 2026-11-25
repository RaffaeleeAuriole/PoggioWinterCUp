<?php
declare(strict_types=1);
require_once __DIR__.'/../../backend/Auth.php';
$cfg = require __DIR__.'/../../config/config.php';
header('Access-Control-Allow-Origin: '.$cfg['allowed_origin']);
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('X-Content-Type-Options: nosniff');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
$sb = new Supabase($cfg);
$method = $_SERVER['REQUEST_METHOD'];
$path = '/'.trim(preg_replace('#^.*?/api/v1#', '', parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)), '/');
$uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
try {
  if ($method==='GET' && $path==='/health') Response::json(true, ['status'=>'ok','php'=>PHP_VERSION]);
  if ($method==='GET' && $path==='/standings') Response::json(true, $sb->rest('GET','standings',['select'=>'*','order'=>'pos']));
  if ($method==='GET' && $path==='/scorers')   Response::json(true, $sb->rest('GET','scorers',['select'=>'*','limit'=>'50']));
  if ($method==='GET' && $path==='/admin/me')  Response::json(true, Auth::requireAdmin($sb));
  if ($method==='POST' && preg_match("#^/admin/matches/($uuid)/close$#", $path, $m)) {
    Auth::requireAdmin($sb);
    $in = json_decode(file_get_contents('php://input'), true);
    if (!is_array($in) || !isset($in['home_goals'],$in['away_goals']) || !is_int($in['home_goals']) || !is_int($in['away_goals']) || !is_array($in['goals'] ?? [])) throw new ApiException('Dati non validi', 422);
    $sb->rpc('close_match', ['p_match'=>$m[1],'p_home'=>$in['home_goals'],'p_away'=>$in['away_goals'],'p_goals'=>$in['goals'] ?? []]);
    Response::json(true, ['closed'=>true]);
  }
  throw new ApiException('Endpoint non trovato', 404);
} catch (ApiException $e) { Response::json(false, null, $e->getMessage(), [], $e->status);
} catch (Throwable $e) { error_log($e->getMessage()); Response::json(false, null, 'Errore interno', [], 500); }
