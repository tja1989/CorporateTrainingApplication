import {expect,it,vi} from "vitest";
vi.mock("@/lib/db/client",async()=>({t:await import("../lib/db/schema"),db:{}}));
import {toCsv} from "../lib/reports";
it("exports neutralize formula-leading text and retain actual numeric cells",()=>{
 const cells=["=1+1","+cmd","-cmd","@SUM(A1)","\t=1","\r=2","  =3","normal,quoted",-5,3];
 expect(toCsv({title:"QA",columns:["=heading"],rows:[cells]})).toBe("'=heading\n'=1+1,'+cmd,'-cmd,'@SUM(A1),'\t=1,\"'\r=2\",'  =3,\"normal,quoted\",-5,3");
});
