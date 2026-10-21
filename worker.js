/**
 * Навигатор будущего — Cloudflare Worker.
 * Static frontend is served from ./public using the ASSETS binding.
 */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};
