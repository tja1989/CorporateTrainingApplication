"use server";
import {requireUser} from "@/lib/auth/guard";
import {moderateFeedback} from "@/lib/feedback/moderation";
import type {FeedbackKind} from "@/lib/feedback/types";
import type {ActionResult} from "@/components/workspace-form";
import {revalidatePath} from "next/cache";
export async function moderateFeedbackAction(kind:FeedbackKind,id:string,form:FormData):Promise<ActionResult>{
 const actor=await requireUser();try{await moderateFeedback(actor,{kind,id,expectedRevision:Number(form.get("revision")),hidden:form.get("hidden")==="on",excluded:form.get("excluded")==="on",reason:String(form.get("reason")??""),requestId:String(form.get("requestId")??"")});revalidatePath("/feedback");revalidatePath("/course","layout");return {success:"Moderation saved."}}catch(error){return {error:error instanceof Error?error.message:"Could not save moderation. Your entries are still here."}}
}
