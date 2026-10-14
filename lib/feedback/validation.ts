export type FeedbackValidation = {ok:true;rating:number;comment:string}|{ok:false;error:string};
export function validateFeedback(rating:unknown,comment:unknown):FeedbackValidation {
 if(typeof rating!=="number"||!Number.isInteger(rating)||rating<1||rating>5)return {ok:false,error:"Choose a whole-number rating from 1 to 5."};
 if(typeof comment!=="string")return {ok:false,error:"Enter a text comment."};
 if(comment.length>2000)return {ok:false,error:"Keep comments within 2,000 characters."};
 return {ok:true,rating,comment};
}
