/**
 * Static OG image endpoint. One `dist/og/<id>.png` per entry in OG_TARGETS,
 * generated at build with Satori + resvg (see `og/render.ts`). The `.png`
 * suffix is literal; `[...path]` carries the nested id (`recipes/classic-5x3`).
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { OG_TARGETS } from '../../og/targets.ts';
import { renderOg, type OgTarget } from '../../og/render.ts';

export const getStaticPaths: GetStaticPaths = () =>
  OG_TARGETS.map((target) => ({ params: { path: target.id }, props: { target } }));

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOg(props.target as OgTarget);
  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
