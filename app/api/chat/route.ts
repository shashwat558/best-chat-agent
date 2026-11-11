// TODO: thin handler — validate (lib/schemas.ts) -> build context ->
// run agent (lib/agent/run.ts) -> stream tokens to the client.

export async function POST() {
  return new Response("Not implemented", { status: 501 });
}
