<?php
namespace App\Http\Controllers {class Controller {}}
namespace Illuminate\Http {class Request {public function __construct(private ?string $token){} public function bearerToken(){return $this->token;}}}
namespace Illuminate\Database {class QueryException extends \RuntimeException {public array $errorInfo;public function __construct($code){$this->errorInfo=[$code];}}}
namespace Illuminate\Support\Facades {class DB {
 public static $calls=[],$code=null;
 public static function transaction($fn){return $fn();}
 public static function selectOne($sql,$args){self::$calls[]=[$sql,$args];if(self::$code)throw new \Illuminate\Database\QueryException(self::$code);return (object)['result'=>'[]'];}
}}
namespace {
 class Denied extends \RuntimeException {}
 function abort($status,$message){throw new Denied($message,$status);}
 function abort_unless($condition,$status,$message){if(!$condition)abort($status,$message);}
 require __DIR__.'/../backends/laravel-api/app/Domains/CRM/Controllers/CallbackController.php';
 require __DIR__.'/../backends/laravel-api/app/Domains/Dispatch/Controllers/JobController.php';
 putenv('JWT_SECRET=job-test-secret');
 $encode=fn($v)=>rtrim(strtr(base64_encode($v),'+/','-_'),'=');
 $claims=['id'=>'20000000-0000-0000-0000-000000000002','tenantId'=>'10000000-0000-0000-0000-000000000001','exp'=>time()+60,'role'=>'SUPER_ADMIN'];
 $value=$encode(json_encode(['alg'=>'HS256'])).'.'.$encode(json_encode($claims));
 $token=$value.'.'.$encode(hash_hmac('sha256',$value,getenv('JWT_SECRET'),true));
 $controller=new \App\Domains\Dispatch\Controllers\JobController();$run=new \ReflectionMethod($controller,'run');$checks=0;
 $request=new \Illuminate\Http\Request($token);
 $run->invoke($controller,$request,'create',['tenantId'=>'forged','propertyId'=>'property']);
 [$sql,$args]=\Illuminate\Support\Facades\DB::$calls[0];
 if(!str_contains($sql,'job_api') || $args[1]!==$claims['tenantId'] || $args[2]!==$claims['id'] || json_decode($args[3],true)!==['tenant_id'=>'forged','property_id'=>'property'])throw new \RuntimeException('Identity or parameter binding mismatch');$checks++;
 foreach([null,'bad'] as $invalid){try{$run->invoke($controller,new \Illuminate\Http\Request($invalid),'list');throw new \RuntimeException('Accepted invalid token');}catch(Denied $e){if($e->getCode()!==401)throw $e;$checks++;}}
 foreach(['P0403'=>403,'P0404'=>404,'P0409'=>409,'XX000'=>500] as $code=>$status){\Illuminate\Support\Facades\DB::$code=$code;try{$run->invoke($controller,$request,'update');throw new \RuntimeException('Accepted denied command');}catch(Denied $e){if($e->getCode()!==$status)throw $e;$checks++;}}
 echo "$checks Laravel job adapter checks passed\n";
}
