// Supabase Edge Function: import-geojson
// Fetches a GeoJSON object from Storage (public or private) and imports it
// into the database by calling the `import_grid_cells` RPC in chunks.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const params = url.searchParams;
    const bucket = params.get('bucket') || 'kilometerhokken';
    const objectPath = params.get('path') || 'hokken_website.geojson';
    const chunkSize = parseInt(params.get('chunk') || '500', 10);
    const isPublic = params.get('public') === '1';

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response('Server misconfigured: SUPABASE_URL or SERVICE_ROLE_KEY missing', { status: 500 });
    }

    const base = SUPABASE_URL.replace(/\/$/, '');

    // Choose storage URL depending on whether the object is public
    let fileUrl;
    const fetchHeaders: Record<string,string> = {};
    if (isPublic) {
      fileUrl = `${base}/storage/v1/object/public/${bucket}/${objectPath}`;
    } else {
      // For private objects use the service role key to authenticate the fetch
      fileUrl = `${base}/storage/v1/object/${bucket}/${objectPath}`;
      fetchHeaders.apikey = SERVICE_ROLE_KEY;
      fetchHeaders.Authorization = `Bearer ${SERVICE_ROLE_KEY}`;
    }

    const geoRes = await fetch(fileUrl, { headers: fetchHeaders });
    if (!geoRes.ok) {
      const body = await geoRes.text().catch(() => '');
      return new Response(`Failed to fetch geojson: ${geoRes.status} ${body}`, { status: 502 });
    }

    const geo = await geoRes.json().catch(() => null);
    if (!geo || !Array.isArray(geo.features)) return new Response('Not a FeatureCollection', { status: 400 });

    const features = geo.features;
    let totalInserted = 0;

    for (let i = 0; i < features.length; i += chunkSize) {
      const slice = features.slice(i, i + chunkSize);
      const body = { data: { type: 'FeatureCollection', features: slice } };

      const rpcUrl = `${base}/rest/v1/rpc/import_grid_cells`;
      const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return new Response(`RPC call failed: ${resp.status} ${text}`, { status: 502 });
      }

      const rpcResult = await resp.json().catch(() => null);
      if (rpcResult && typeof rpcResult === 'number') totalInserted += rpcResult;
      else if (Array.isArray(rpcResult) && rpcResult.length && typeof rpcResult[0] === 'number') totalInserted += rpcResult[0];
      else totalInserted += slice.length;
    }

    return new Response(JSON.stringify({ inserted: totalInserted }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(String(err.stack || err.message || err), { status: 500 });
  }
});
