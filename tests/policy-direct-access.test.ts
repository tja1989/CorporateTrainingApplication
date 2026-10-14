import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({role:"INSTRUCTOR"}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("not-found")}}));
vi.mock("@/lib/auth/guard",()=>({requireUser:async()=>({id:"u",role:state.role})}));
vi.mock("@/lib/db/client",async()=>({t:await import("../lib/db/schema"),db:{select:()=>({from:()=>({where:()=>({limit:async()=>[{id:"p",audience:"managers",body:"Restricted management policy"}]})})})}}));
vi.mock("@/lib/markdown",()=>({Markdown:()=>null,slugify:()=>""}));
vi.mock("@/components/ui",()=>({Card:()=>null,Chip:()=>null,PageTitle:()=>null}));
vi.mock("../app/(learner)/policy/[docId]/scroll",()=>({ScrollToSection:()=>null}));
import PolicyPage from "../app/(learner)/policy/[docId]/page";
beforeEach(()=>{state.role="INSTRUCTOR";vi.stubGlobal("React",{createElement:()=>({rendered:true})})});
it("a direct Instructor URL cannot disclose a manager-only policy body",async()=>{
 await expect(PolicyPage({params:Promise.resolve({docId:"p"}),searchParams:Promise.resolve({})})).rejects.toThrow("not-found");
});
