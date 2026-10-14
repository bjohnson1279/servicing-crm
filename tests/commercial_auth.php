<?php
namespace App\Http\Controllers {class Controller {}}
namespace Illuminate\Http {class Request {
 public function __construct(private ?string $token,private array $body=[]){ }
 public function bearerToken(){return $this->token;}
 public function getContent(){return json_encode($this->body);}
 public function method(){return 'GET';}
 public function query(){return $this->body;}
 public function json(){return $this;}
 public function all(){return $this->body;}
}}
namespace Illuminate\Database {class QueryException extends \RuntimeException {public array $errorInfo;public function __construct($code){$this->errorInfo=[$code];}}}
namespace Illuminate\Support\Facades {class DB {
 public static $calls=[],$code=null;
 public static function transaction($fn){return $fn();}
 public static function selectOne($sql,$args){self::$calls[]=[$sql,$args];if(self::$code)throw new \Illuminate\Database\QueryException(self::$code);return(object)['result'=>'{}'];}
}}
namespace {
 class Denied extends \RuntimeException {}
 function abort_unless($ok,$status,$message){if(!$ok)throw new Denied($message,$status);}
 function abort_if($condition,$status,$message){abort_unless(!$condition,$status,$message);}
 function response(){return new class{public function json($body,$status=200){return[$status,$body];}};}
 require __DIR__.'/../backends/laravel-api/app/Domains/CRM/Controllers/CallbackController.php';
 require __DIR__.'/../backends/laravel-api/app/Domains/CRM/Controllers/CommercialController.php';
 putenv('JWT_SECRET=commercial-test-secret');$enc=fn($v)=>rtrim(strtr(base64_encode($v),'+/','-_'),'=');
 $claims=['id'=>'20000000-0000-0000-0000-000000000002','tenantId'=>'10000000-0000-0000-0000-000000000001','role'=>'SUPER_ADMIN','exp'=>time()+60];
 $value=$enc(json_encode(['alg'=>'HS256'])).'.'.$enc(json_encode($claims));$token=$value.'.'.$enc(hash_hmac('sha256',$value,getenv('JWT_SECRET'),true));
 $controller=new \App\Domains\CRM\Controllers\CommercialController();$id='40000000-0000-0000-0000-000000000001';$checks=0;
 $request=new \Illuminate\Http\Request($token,['id'=>'forged','tenant_id'=>'forged','role'=>'MANAGER']);
 $controller->handle($request,$id);[$sql,$args]=\Illuminate\Support\Facades\DB::$calls[0];
 if(!str_contains($sql,'commercial_api')||$args[1]!==$claims['tenantId']||$args[2]!==$claims['id']||json_decode($args[3],true)['id']!==$id)throw new \RuntimeException('Identity or route ID mismatch');$checks++;
 foreach([null,'bad'] as $bad){try{$controller->handle(new \Illuminate\Http\Request($bad));throw new \RuntimeException('Accepted invalid identity');}catch(Denied $e){if($e->getCode()!==401)throw $e;$checks++;}}
 foreach(['P0403'=>403,'P0404'=>404,'P0409'=>409,'P0503'=>503,'XX000'=>500] as $code=>$status){\Illuminate\Support\Facades\DB::$code=$code;if($controller->handle($request,$id)[0]!==$status)throw new \RuntimeException('Error mapping mismatch');$checks++;}
 echo "$checks Laravel commercial checks passed\n";
}
