import { and, eq, isNull } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { id } from "@/lib/ids";
import { hasPermission } from "@/lib/auth/permissions";
import type { Actor } from "@/lib/auth/roles";
import { reevaluateUser } from "@/lib/lms/rules";
function authorize(actor:Actor){if(!hasPermission(actor.role,"identity.manage"))throw new Error("Only Super Admin can manage departments.");}
function departmentName(name:string){const value=name.trim();if(!value || value.length>120)throw new Error("Enter a department name of 1–120 characters.");return value;}
export async function createDepartment(actor:Actor,name:string):Promise<string>{
  authorize(actor);const departmentId=id();await db.insert(t.departments).values({id:departmentId,name:departmentName(name)});return departmentId;
}
export async function renameDepartment(actor:Actor,departmentId:string,name:string):Promise<void>{
  authorize(actor);const result=await db.update(t.departments).set({name:departmentName(name)}).where(eq(t.departments.id,departmentId)).returning({id:t.departments.id});
  if(!result.length)throw new Error("Department not found.");
}
export async function assignDepartment(actor:Actor,userId:string,departmentId:string|null):Promise<void>{
  authorize(actor);
  await db.transaction(async tx=>{
    if(departmentId){const [department]=await tx.select({id:t.departments.id}).from(t.departments).where(eq(t.departments.id,departmentId)).limit(1);if(!department)throw new Error("Department not found.");}
    const result=await tx.update(t.users).set({departmentId}).where(and(eq(t.users.id,userId),isNull(t.users.erasedAt))).returning({id:t.users.id});
    if(!result.length)throw new Error("Employee not found.");
    await reevaluateUser(userId,tx);
  });
}
