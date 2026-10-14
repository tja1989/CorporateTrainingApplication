import {randomUUID} from "node:crypto";
import {createPerson,withDb} from "./support";
import {saveFeedback} from "../lib/feedback/service";
export async function feedbackReportFixture(){
 const a=randomUUID(),b=randomUUID(),course=randomUUID();await withDb(db=>db.query("INSERT INTO departments(id,name) VALUES($1,'QA feedback A'),($2,'QA feedback B')",[a,b]));
 const hr=await createPerson("HR_HEAD"),head=await createPerson("DEPARTMENT_HEAD",{departmentId:a}),trainer=await createPerson("INSTRUCTOR"),otherTrainer=await createPerson("INSTRUCTOR"),employee=await createPerson("LEARNER",{departmentId:a,name:"PRIVATE Feedback Employee A"}),foreign=await createPerson("LEARNER",{departmentId:b,name:"FOREIGN Feedback Employee B"});
 const title="QA feedback reports "+course.slice(0,8);await withDb(db=>db.query("INSERT INTO courses(id,title,instructor_id,department_id,status,approval_state) VALUES($1,$2,$3,$4,'PUBLISHED','LEGACY_PUBLISHED')",[course,title,otherTrainer.id,b]));
 for(const [person,instructor,department,rating,comment] of [[employee,trainer,a,5,"Helpful examples"],[foreign,otherTrainer,b,2,"More explanation"]] as const){
  const completion=randomUUID(),delivery=randomUUID(),enrollment=randomUUID();await withDb(async db=>{await db.query("UPDATE users SET group_ids=$2 WHERE id=$1",[person.id,JSON.stringify(["QA_SHARED_FEEDBACK"])]);await db.query("INSERT INTO completion_records(id,user_id,course_id) VALUES($1,$2,$3)",[completion,person.id,course]);await db.query("INSERT INTO enrollments(id,user_id,course_id,source,status,completed_at) VALUES($1,$2,$3,'manual','COMPLETED',now())",[enrollment,person.id,course]);await db.query("INSERT INTO course_deliveries(id,enrollment_id,course_id,department_id,instructor_id,completed_record_id) VALUES($1,$2,$3,$4,$5,$6)",[delivery,enrollment,course,department,instructor.id,completion])});
  for(const kind of ["course","instructor"] as const)await saveFeedback({id:person.id,role:"LEARNER",departmentId:department},{kind,completionId:completion,rating,comment,expectedRevision:0,requestId:randomUUID()});
 }
 return {course,title,hr,head,trainer,otherTrainer,employee,foreign};
}
