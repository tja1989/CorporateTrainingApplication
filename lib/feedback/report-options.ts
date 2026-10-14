import {DEFAULT_TZ} from "@/lib/time";
import type {FeedbackReportFilters} from "./reports";
import {feedbackPeriod} from "./periods";
export type FeedbackReportParams={kind?:string;period?:string;start?:string;end?:string;courseId?:string;instructorId?:string};
export function feedbackReportFilters(params:FeedbackReportParams,now=new Date()):FeedbackReportFilters{
 const kind=params.kind??"course",period=params.period??"week";
 if(!["course","instructor"].includes(kind))throw new Error("Choose course or instructor feedback.");if(!["week","month","custom"].includes(period))throw new Error("Choose week, month or custom period.");
 return {kind:kind as FeedbackReportFilters["kind"],period:feedbackPeriod(period as "week"|"month"|"custom",now,DEFAULT_TZ,period==="custom"?{start:params.start??"",end:params.end??""}:undefined),courseId:params.courseId||undefined,instructorId:params.instructorId||undefined};
}
