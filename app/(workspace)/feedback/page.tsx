import {requirePermission} from "@/lib/auth/guard";
import {feedbackReport} from "@/lib/feedback/reports";
import {feedbackReportFilters,type FeedbackReportParams} from "@/lib/feedback/report-options";
import {FeedbackReports} from "@/components/feedback-reports";
export const dynamic="force-dynamic";
export default async function FeedbackReportPage({searchParams}:{searchParams:Promise<FeedbackReportParams>}){
 const actor=await requirePermission("feedback.read"),params=await searchParams;
 try{const report=await feedbackReport(actor,feedbackReportFilters(params));return <FeedbackReports actor={actor} params={params} report={report}/>}catch(error){return <FeedbackReports actor={actor} params={params} report={null} error={error instanceof Error?error.message:"Could not load feedback reports."}/>}
}
