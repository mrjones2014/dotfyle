import { trpc } from '$lib/trpc/client';
import type { ServerLoadEvent } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async function load(e: ServerLoadEvent) {
  const user = await trpc(e).getUser.query()
  if (user) {
    return {
      user: {
        ...user,
        createdAt: new Date(user.createdAt)
      }
    };
  }

  return {
    user,
  }
}
