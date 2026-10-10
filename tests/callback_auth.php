<?php
// Isolated auth verification; no Laravel installation or database required.
namespace App\Http\Controllers { class Controller {} }
namespace Illuminate\Http {
    class Request {
        public function __construct(private ?string $token) {}
        public function bearerToken() { return $this->token; }
    }
}
namespace {
    class AuthFailure extends \RuntimeException {}
    function abort_unless($condition, $status, $message) { if (!$condition) throw new AuthFailure($message,$status); }
    require __DIR__.'/../backends/laravel-api/app/Domains/CRM/Controllers/CallbackController.php';
    putenv('JWT_SECRET=callback-test-signing-key');
    $encode = fn($value) => rtrim(strtr(base64_encode($value),'+/','-_'),'=');
    $token = function ($claims, $algorithm='HS256') use ($encode) {
        $value=$encode(json_encode(['alg'=>$algorithm])).'.'.$encode(json_encode($claims));
        return $value.'.'.$encode(hash_hmac('sha256',$value,getenv('JWT_SECRET'),true));
    };
    $claims=['id'=>'20000000-0000-0000-0000-000000000002','tenantId'=>'10000000-0000-0000-0000-000000000001','exp'=>time()+3600];
    $controller=new \App\Domains\CRM\Controllers\CallbackController();
    $actor=new \ReflectionMethod($controller,'actor');
    $result=$actor->invoke($controller,new \Illuminate\Http\Request($token($claims)));
    if ($result !== [$claims['tenantId'],$claims['id']]) throw new \RuntimeException('Identity mismatch');
    $checks=1;
    foreach ([null,'bad',$token(array_merge($claims,['exp'=>1])),$token($claims,'none'),$token(array_merge($claims,['nbf'=>time()+7200])),$token(array_merge($claims,['id'=>[]])),$token(array_merge($claims,['exp'=>'99999999999']))] as $invalid) {
        try { $actor->invoke($controller,new \Illuminate\Http\Request($invalid)); throw new \RuntimeException('Accepted invalid token'); }
        catch (AuthFailure $error) { if ($error->getCode() !== 401) throw $error; $checks++; }
    }
    echo "Laravel callback auth: $checks assertions passed\n";
}
