import { state } from "./state.mjs";
export async function createClient() {
  return {
    auth: {
      async getUser() {
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
