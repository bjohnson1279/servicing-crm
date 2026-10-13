export interface CatalogData {trade_name:string;manufacturer:string;category:string;jurisdiction:string;identifier_status:string;identifier_type:string;identifier_value:string;identifier_reason:string;label_required:boolean;sds_required:boolean;document_exception:string;inventory_item_id:string|null}
export interface CatalogDocument {id:string;name:string;document_type:string;source_kind:string;source_authority:string;source_url?:string;source_date?:string;unknown_date_reason?:string;retrieved_at:string;sha256?:string}
export interface CatalogVersion {revision:number;status:string;version:number;data:CatalogData;documents:CatalogDocument[];verified_at?:string;review_due_at?:string}
export interface CatalogProduct {id:string;code:string;versions:CatalogVersion[];events:{id:string;action:string;reason:string;created_at:string}[]}
export const catalogToken=()=>sessionStorage.getItem('crm_access_token');
export class CatalogError extends Error {constructor(public status:number,message:string){super(message);}}
const base=((import.meta as unknown as {env:Record<string,string>}).env.VITE_API_BASE_URL||'/api/v1').replace(/\/$/,'')+'/catalog';
export async function catalogApi<T>(path:string,body?:unknown):Promise<T>{
 const token=catalogToken();if(!token)throw new CatalogError(401,'Sign in through your organization to view product references.');
 let response:Response;try{response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}catch{throw new CatalogError(0,'Connection interrupted. Your action is not confirmed; retry when connected.');}
 if(catalogToken()!==token)throw new CatalogError(401,'Your session changed. Reload the catalog.');
 let value:any;try{value=await response.json();}catch{throw new CatalogError(0,'Response could not be confirmed. Retry the same action.');}
 if(!response.ok)throw new CatalogError(response.status,value.error||value.detail||'Catalog request failed.');return value as T;
}
