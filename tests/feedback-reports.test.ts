import {expect,it,vi} from "vitest";
vi.mock("@/lib/db/client",async()=>({t:await import("../lib/db/schema"),db:{}}));
import {assembleFeedbackReport,feedbackCsv,type FeedbackReportRecord} from "../lib/feedback/reports";
const period={start:new Date("2026-10-01T00:00:00Z"),end:new Date("2026-11-01T00:00:00Z"),label:"October 2026"};
const record=(departmentId="a",employeeName="PRIVATE EMPLOYEE"):FeedbackReportRecord=>({response:{id:employeeName,employeeId:employeeName,completionRecordId:"done",courseId:"c",deliveryId:"d",departmentId,rating:2,comment:"Later comment",revision:2,commentHidden:false,excluded:false,moderationReason:"",createdAt:new Date("2026-10-02Z"),updatedAt:new Date("2026-11-05Z")},delivery:{id:"d",enrollmentId:"e",courseId:"c",departmentId,instructorId:"trainer",completedRecordId:"done"},employeeName,employeeCode:"PRIVATE-ID",courseTitle:"=Formula course",instructorName:"Trainer",revisions:[{revision:1,newRating:5,newComment:"Original comment",newHidden:false,newExcluded:false,at:new Date("2026-10-02Z")},{revision:2,newRating:2,newComment:"Later comment",newHidden:false,newExcluded:false,at:new Date("2026-11-05Z")}]});
it("a late edit cannot rewrite a closed period and a currently hidden comment cannot resurface",()=>{
 const hr={id:"hr",role:"HR_HEAD" as const,departmentId:null};const row=record();
 const report=assembleFeedbackReport(hr,{kind:"course",period},[row]);expect(report.responses).toBe(1);expect(report.average).toBe(5);expect(report.rows.flat()).toContain("Original comment");expect(report.rows.flat()).not.toContain("Later comment");
 row.response.commentHidden=true;expect(assembleFeedbackReport(hr,{kind:"course",period},[row]).rows.flat()).not.toContain("Original comment");
});
it("Instructor pages and CSV use historical delivery and exclude identity, even after reassignment",()=>{
 const trainer={id:"trainer",role:"INSTRUCTOR" as const,departmentId:"a"};const report=assembleFeedbackReport(trainer,{kind:"course",period},[record()]);expect(report.responses).toBe(1);expect(report.columns.join()).not.toMatch(/Employee|ID/);expect(feedbackCsv(report)).not.toMatch(/PRIVATE/);expect(feedbackCsv(report)).toContain("'=Formula course");
 const other={...record()};other.delivery={...other.delivery!,instructorId:"different"};expect(assembleFeedbackReport(trainer,{kind:"course",period},[other]).responses).toBe(0);
});
it("Department Head sees only delivery-department course detail and aggregate instructor ratings",()=>{
 const head={id:"head",role:"DEPARTMENT_HEAD" as const,departmentId:"a"};const rows=[record(),record("b","FOREIGN PRIVATE")];
 expect(assembleFeedbackReport(head,{kind:"course",period},rows).rows.flat()).toContain("PRIVATE EMPLOYEE");expect(assembleFeedbackReport(head,{kind:"course",period},rows).rows.flat()).not.toContain("FOREIGN PRIVATE");
 const report=assembleFeedbackReport(head,{kind:"instructor",period},rows);expect(report.responses).toBe(1);expect(report.columns.join()).not.toMatch(/Employee|Comment/);expect(feedbackCsv(report)).not.toMatch(/PRIVATE|Original comment/);
});
it("empty scopes and excluded cutoff revisions never invent a zero-star rating",()=>{
 const empty={id:"head",role:"DEPARTMENT_HEAD" as const,departmentId:null};const report=assembleFeedbackReport(empty,{kind:"course",period},[record()]);expect(report.rows).toEqual([]);expect(report.average).toBeNull();expect(report.distribution).toEqual([0,0,0,0,0]);
 const row=record();row.revisions[0].newExcluded=true;expect(assembleFeedbackReport({id:"hr",role:"HR_HEAD",departmentId:null},{kind:"course",period},[row]).responses).toBe(0);
});
