import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ChemicalLog} from '../ChemicalLog';
vi.mock('../../offlineQueue',()=>({enqueueRequest:vi.fn()}));
beforeEach(()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>[
 {id:'bif',name:'BIF item',sku:'BIF-TEST',quantity:10},{id:'ter',name:'TER item',sku:'TER-TEST',quantity:10},{id:'other',name:'Other item',sku:'OTHER',quantity:10}
]}));});afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('leaves identifiers unknown for every inventory SKU and clears a prior manual value',async()=>{
 render(<MemoryRouter><ChemicalLog/></MemoryRouter>);
 await screen.findByRole('option',{name:/BIF item/});
 const selector=screen.getByRole('combobox',{name:/Select Chemical from Inventory/});
 const identifier=screen.getByLabelText('EPA Registration #') as HTMLInputElement;
 for(const item of ['bif','ter','other']){
  fireEvent.change(identifier,{target:{value:'Previously entered'}});fireEvent.change(selector,{target:{value:item}});expect(identifier.value).toBe('');
 }
 expect(screen.queryByDisplayValue('EPA Reg. No. 279-3206')).toBeNull();expect(screen.queryByDisplayValue('EPA Reg. No. 432-1363')).toBeNull();
});
