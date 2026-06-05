import {
  checkSupabaseContract,
  loadSupabaseContract,
} from './lib/supabase-contract.mjs';

const failures = checkSupabaseContract(loadSupabaseContract());

if (failures.length > 0) {
  console.error('Supabase contract check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Supabase contract check passed');
