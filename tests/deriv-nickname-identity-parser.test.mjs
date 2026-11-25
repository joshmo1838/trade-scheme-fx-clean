import test from "node:test";
import assert from "node:assert/strict";
import { parseDerivNicknameIdentity } from "../lib/deriv/nickname-identity-parser.mjs";

const uuid="3d8f2010-78c4-4e3a-8ad9-63d14b3a2d80";
test("parses Deriv's successful meta/data identity envelope",()=>{
  assert.deepEqual(parseDerivNicknameIdentity({data:{external_reference_id:uuid,nickname:"test"},meta:{}}),{externalReferenceId:uuid});
  assert.deepEqual(parseDerivNicknameIdentity({data:{external_reference_id:uuid,nickname:"test"},errors:[],metadata:{}}),{externalReferenceId:uuid});
});
test("rejects errors, missing identity, and trading-account identifiers",()=>{
  for(const response of [null,{}, {data:{external_reference_id:uuid},errors:[{code:"failed"}]}, {data:{account_id:"DOT90004580"},errors:[]}, {data:{external_reference_id:"DOT90004580"},errors:[]}, {data:{external_reference_id:uuid},errors:"malformed"}, {data:{external_reference_id:"not-a-uuid"},errors:[]}]){
    assert.throws(()=>parseDerivNicknameIdentity(response));
  }
});
