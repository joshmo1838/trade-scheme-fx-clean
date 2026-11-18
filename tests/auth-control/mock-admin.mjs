import { state } from "./state.mjs";
export function createClient(url,key,opts) {
  if (url !== "https://ci-senfx.invalid" || key !== "CI-SERVICE-ROLE-ONLY" ||
      opts?.auth?.persistSession !== false || opts?.auth?.autoRefreshToken !== false) {
    throw Error("The test API must use test-only service credentials.");
  }
  return {
    async rpc(name,args) {
      if (name !== "senfx_queue_paper_bot_command") {
        throw Error("Unexpected privileged RPC " + name);
      }
      state.adminCalls.push({name,args});
      if (state.failWrites) return {data:null,error:{code:"TEST_DB_UNAVAILABLE"}};
      const existing=state.commands.find(row=>row.id===args.p_command_id);
      if (existing) {
        if (existing.customer_id !== args.p_customer_id ||
            existing.bot_id !== args.p_bot_id || existing.action !== args.p_action) {
          return {data:{accepted:false,reason:"Command ID was used for a different request."},error:null};
        }
        return {data:{
          accepted:true,duplicate:true,queued:true,
          runId:existing.run_id,commandId:existing.id,
          desiredState:existing.requested_state,version:existing.version,
        },error:null};
      }
      if (state.ownedBots.get(args.p_bot_id)!==args.p_customer_id) {
        return {data:{accepted:false,reason:"Customer cannot control this bot."},error:null};
      }
      let run=state.rows.find(r=>r.customer_id===args.p_customer_id && r.bot_id===args.p_bot_id);
      if (!run && args.p_action!=="start") {
        return {data:{accepted:false,reason:"No active paper bot."},error:null};
      }
      if (!run) {
        run={
          id:"33333333-3333-4333-8333-333333333333",
          customer_id:args.p_customer_id,bot_id:args.p_bot_id,
          mode:"paper",desired_state:"stopped",observed_state:"stopped",
          control_version:0,heartbeat_at:null,lease_expires_at:null,last_error:null,
          updated_at:new Date().toISOString(),
        };
        state.rows.push(run);
      }
      const from=run.desired_state;
      const action=args.p_action;
      const next = action==="start" && from==="stopped" ? "running"
        : action==="pause" && from==="running" ? "paused"
        : action==="resume" && from==="paused" ? "running"
        : action==="stop" ? "stopped" : null;
      if (next === null) {
        return {data:{accepted:false,reason:"Invalid state transition."},error:null};
      }
      run.desired_state=next;
      run.control_version++;
      run.updated_at=new Date().toISOString();
      const command={
        id:args.p_command_id,run_id:run.id,customer_id:args.p_customer_id,
        bot_id:args.p_bot_id,action:args.p_action,
        requested_state:next,version:run.control_version,
        status:"queued",created_at:new Date().toISOString(),acknowledged_at:null,
      };
      state.commands.push(command);
      return {data:{
        accepted:true,duplicate:false,queued:true,
        runId:run.id,commandId:command.id,
        desiredState:next,version:command.version,
      },error:null};
    },
  };
}
