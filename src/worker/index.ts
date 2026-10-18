/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export { OfficeDurableObject } from './OfficeDurableObject';

interface Env {
  OFFICE_ROOM: any; // DurableObjectNamespace
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Route multiplayer requests to the designated room Durable Object
    if (url.pathname.startsWith('/ws') || url.pathname.startsWith('/api/rooms')) {
      const roomId = url.searchParams.get('roomId') || 'main_office';
      const id = env.OFFICE_ROOM.idFromName(roomId);
      const roomStub = env.OFFICE_ROOM.get(id);

      const forwardUrl = new URL(request.url);
      if (url.pathname.startsWith('/ws')) {
        forwardUrl.pathname = '/websocket';
      } else {
        forwardUrl.pathname = '/occupants';
      }

      return roomStub.fetch(new Request(forwardUrl.toString(), request));
    }

    return new Response('GatherGrid Cloudflare Worker Active', { status: 200 });
  },
};
