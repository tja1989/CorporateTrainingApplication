import {beforeEach,expect,it,vi} from "vitest";
import {PgDialect} from "drizzle-orm/pg-core";
const state=vi.hoisted(()=>({instructor:"trainer-a",deliveries:[] as any[],enrollments:{first:{id:"first",courseId:"c"},renewal:{id:"renewal",courseId:"c"},legacy:{id:"legacy",courseId:"c"}} as Record<string,any>}));
vi.mock("@/lib/db/client",async()=>({t:await import("../lib/db/schema"),db:{}}));
import {t} from "../lib/db/client";
import {snapshotEnrollment,linkCompletionDelivery} from "../lib/feedback/delivery";
const dialect=new PgDialect();
const tx:any={
 select:()=>({from:(table:unknown)=>({where:(where:any)=>({limit:async()=>{const key=dialect.sqlToQuery(where).params[0];return table===t.courseDeliveries?state.deliveries.filter(d=>d.enrollmentId===key):table===t.enrollments?[state.enrollments[String(key)]].filter(Boolean):[{id:"c",departmentId:"dept-a",instructorId:state.instructor}]}})})}),
 insert:()=>({values:(value:any)=>({onConflictDoNothing:()=>({returning:async()=>{state.deliveries.push(value);return [value]}})})}),
 update:()=>({set:(value:any)=>({where:async()=>{Object.assign(state.deliveries[0],value)}})})
};
beforeEach(()=>{state.instructor="trainer-a";state.deliveries=[]});
it("later reassignment cannot retarget the original delivery",async()=>{
 const first=await snapshotEnrollment(tx,"first");state.instructor="trainer-b";
 expect((await snapshotEnrollment(tx,"first")).instructorId).toBe("trainer-a");
 expect((await snapshotEnrollment(tx,"renewal")).instructorId).toBe("trainer-b");
 expect(first.departmentId).toBe("dept-a");expect(state.deliveries).toHaveLength(2);
});
it("completion links the immutable delivery while legacy history gets no invented instructor",async()=>{
 await snapshotEnrollment(tx,"first");state.instructor="trainer-b";await linkCompletionDelivery(tx,"first","done-a");expect(state.deliveries[0]).toMatchObject({instructorId:"trainer-a",completedRecordId:"done-a"});
 state.deliveries=[];await linkCompletionDelivery(tx,"legacy","done-legacy");expect(state.deliveries[0]).toMatchObject({instructorId:null,departmentId:null,completedRecordId:"done-legacy"});
});
