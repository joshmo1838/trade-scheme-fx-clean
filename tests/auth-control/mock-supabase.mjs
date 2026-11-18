import { state } from "./state.mjs";
export async function createClient() {
  return {
    auth: {
      async getUser() {
        // Only when CI starts a genuine local Supabase Auth (GoTrue) process.
        // Never trust a user ID supplied by our fixture: Auth must verify JWT.
        if (process.env.SENFX_TEST_REAL_AUTH_URL) {
          if (!state.currentToken) {
            return {data:{user:null},error:{message:"No authentication token"}};
          }
          const response=await fetch(process.env.SENFX_TEST_REAL_AUTH_URL + "/user",{
            headers:{
              Authorization:"Bearer " + state.currentToken,
              apikey:process.env.SENFX_TEST_AUTH_ANON_KEY || "local-auth-ci-placeholder"
            }
          });
          if (!response.ok) {
            return {data:{user:null},error:{message:"Auth token rejected",status:response.status}};
          }
          const verifiedUser=await response.json();
          return {data:{user:verifiedUser},error:null};
        }
        return {data:{user:state.currentUser ? {id:state.currentUser} : null},error:null};
      },
    },
    from(table) {
      if (!["bot_execution_runs","bot_execution_commands",
            "bot_execution_paper_positions","customer_paper_daily_risk"].includes(table)) {
        throw Error("Unexpected user table " + table);
      }
      const filters = {};
      return {
        select() {return this;},
        eq(name,value) {filters[name]=value;return this;},
        order() {return this;},
        async limit(n) {
          if (state.failReads) return {data:null,error:{code:"TEST_DB_UNAVAILABLE"}};
          if (filters.customer_id !== state.currentUser) {
            throw Error("Customer read was not filtered to authenticated user.");
          }
          const source = table === "bot_execution_runs" ? state.rows
            : table === "bot_execution_commands" ? state.commands
            : table === "bot_execution_paper_positions" ? state.positions : state.dailyRisk;
          return {
            data:source.filter(row =>
              row.customer_id===state.currentUser &&
              row.customer_id===filters.customer_id &&
              Object.entries(filters).every(([key,value])=>row[key]===value)).slice(0,n),
            error:null,
          };
        },
      };
    },
  };
}
