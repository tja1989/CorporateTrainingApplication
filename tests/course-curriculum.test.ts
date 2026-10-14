import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({responses:[] as unknown[][]}));
vi.mock("../lib/db/client",async()=>({t:await import("../lib/db/schema"),db:{}}));
import {validateCurriculum} from "../lib/courses/workflow";
function transaction():any{return {select:()=>{const rows=state.responses.shift()??[];const q:any={from:()=>q,innerJoin:()=>q,where:()=>q,limit:async()=>rows,then:(resolve:any)=>Promise.resolve(rows).then(resolve)};return q;}};}
beforeEach(()=>{state.responses=[];});
it("repeated random sections use the same bank when the total approved pool is sufficient",async()=>{
  state.responses=[[{lesson:{type:"QUIZ",title:"Quiz",payload:{quizId:"q"}}}],[{sections:[{bankId:"b",pickN:2},{bankId:"b",pickN:2}]}],[{id:"1"},{id:"2"},{id:"3"},{id:"4"}]];
  expect(await validateCurriculum(transaction(),"c")).toBe(1);
});
it("rejects a video which is not ready",async()=>{
  state.responses=[[{lesson:{type:"VIDEO",title:"Video",payload:{videoId:"v"}}}],[{ingestionStatus:"FETCHING"}]];
  await expect(validateCurriculum(transaction(),"c")).rejects.toThrow("Every video transcript must be ready");
});
it("rejects an assessment bank below its configured total",async()=>{
  state.responses=[[{lesson:{type:"QUIZ",title:"Quiz",payload:{quizId:"q"}}}],[{sections:[{bankId:"b",pickN:5}]}],[{id:"1"}]];
  await expect(validateCurriculum(transaction(),"c")).rejects.toThrow("too few approved questions");
});
