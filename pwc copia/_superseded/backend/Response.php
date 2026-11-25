<?php
declare(strict_types=1);
final class ApiException extends RuntimeException { public function __construct(string $m, public int $status = 400) { parent::__construct($m); } }
final class Response {
  public static function json(bool $ok, mixed $data = null, ?string $error = null, array $meta = [], int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success'=>$ok,'data'=>$data,'error'=>$error,'meta'=>(object)$meta], JSON_UNESCAPED_UNICODE);
    exit;
  }
}
