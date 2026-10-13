export interface InspectionZone { name:string; pests:string[]; evidence:string; severity:string; inaccessible:boolean; notes:string }
export interface InspectionFindings { summary:string; zones:InspectionZone[] }
export interface Inspection {
 id:string;job_id:string;state:string;version:number;revision:number;property_address:string;customer_name:string;job_status:string;
 revisions:{revision:number;findings:InspectionFindings;submitted_at?:string;review_reason?:string}[];
 attachments:{id:string;name:string;revision:number}[];
 events:{id:string;action:string;reason?:string;created_at:string}[];
}
export const inspectionToken=()=>sessionStorage.getItem('crm_access_token');
export class InspectionError extends Error {constructor(public status:number,message:string){super(message);}}
const base=((import.meta as unknown as {env:Record<string,string>}).env.VITE_API_BASE_URL||'/api/v1').replace(/\/$/,'')+'/inspections';
export async function inspectionApi<T>(path:string,body?:unknown):Promise<T> {
 const token=inspectionToken();
 if(!token)throw new InspectionError(401,'Sign in through your organization to use inspections.');
 let response:Response;
 try {response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}
 catch {throw new InspectionError(0,'Connection interrupted. Your action is not confirmed; retry when connected.');}
 if(inspectionToken()!==token)throw new InspectionError(401,'Your session changed. Reload the inspection.');
 const value=await response.json();
 if(!response.ok)throw new InspectionError(response.status,value.error||value.detail||'Inspection request failed.');
 return value as T;
}
