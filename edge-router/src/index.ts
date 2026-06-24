// Edge Router — Cloudflare Worker entry point
// TODO: Implement Durable Object WebSocket router for GeoHash Pub/Sub
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response('Aegis Edge Router — operational', { status: 200 });
  },
};

interface Env {
  // Durable Object bindings will be declared here
}
