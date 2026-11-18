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
              apikey:"local-auth-ci-placeholder"
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
      if (table !== "bot_execution_runs" && table !== "bot_execution_commands") {
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
          const source = table === "bot_execution_runs" ? state.rows : state.commands;
          return {
            data:source.filter(row =>
              row.customer_id===state.currentUser &&
              row.customer_id===filters.customer_id).slice(0,n),
            error:null,
          };
        },
      };
    },
  };
}
