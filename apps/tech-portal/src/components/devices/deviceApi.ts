export interface PropertyDevice {
 id:string;property_id:string;property_address:string;label:string;device_type:string;lifecycle:string;version:number;location_version:number;
 manufacturer_serial?:string;historical_installation:boolean;installed_at?:string;replaces_device_id?:string;replacement_device_id?:string;
 locations:{version:number;zone:string;description:string;latitude?:number;longitude?:number;accuracy_meters?:number;reason:string;effective_at:string}[];
 events:{id:string;action:string;reason:string;created_at:string}[];
}
export const deviceToken=()=>sessionStorage.getItem('crm_access_token');
export class DeviceError extends Error{constructor(public status:number,message:string){super(message);}}
const base=((import.meta as unknown as {env:Record<string,string>}).env.VITE_API_BASE_URL||'/api/v1').replace(/\/$/,'')+'/devices';
export async function deviceApi<T>(path:string,body?:unknown):Promise<T>{
 const token=deviceToken();if(!token)throw new DeviceError(401,'Sign in through your organization to view devices.');
 let response:Response;try{response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}catch{throw new DeviceError(0,'Connection interrupted. Your action is not confirmed; retry when connected.');}
 if(deviceToken()!==token)throw new DeviceError(401,'Your session changed. Reload the register.');
 let value:any;try{value=await response.json();}catch{throw new DeviceError(0,'Response could not be confirmed. Retry the same action.');}
 if(!response.ok)throw new DeviceError(response.status,value.error||value.detail||'Device request failed.');return value as T;
}
