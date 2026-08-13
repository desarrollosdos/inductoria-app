// Inductoria · Edge Function: extraer-texto-archivo
// ------------------------------------------------
// Contenido.jsx sube un PDF o .docx (base64) y esto devuelve el texto
// plano extraído, para que el dueño lo vea y edite en el textarea antes
// de aprobarlo, igual que hoy hace con .txt (pero ahí se lee directo en
// el navegador, esto pasa por el servidor porque parsear PDF/docx en
// browser es pesado de mantener).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'npm:unpdf@0.11.0';
import mammoth from 'npm:mammoth@1.8.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TAMANO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const archivoBase64 = body.archivo_base64 as string | undefined;
    const nombreArchivo = (body.nombre_archivo as string | undefined) || '';
    const tipo = (body.tipo as string | undefined) || '';

    if (!archivoBase64) {
      return new Response(JSON.stringify({ error: 'Falta el archivo' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bytes = Uint8Array.from(atob(archivoBase64), (c) => c.charCodeAt(0));

    if (bytes.length > TAMANO_MAX_BYTES) {
      return new Response(JSON.stringify({ error: 'El archivo pesa más de 10 MB' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const esPdf = tipo === 'application/pdf' || nombreArchivo.toLowerCase().endsWith('.pdf');
    const esDocx =
      tipo === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      nombreArchivo.toLowerCase().endsWith('.docx');

    if (!esPdf && !esDocx) {
      return new Response(JSON.stringify({ error: 'Solo se aceptan PDF, .docx o .txt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let textoExtraido = '';

    if (esPdf) {
      const pdf = await getDocumentProxy(bytes);
      const resultado = await extractText(pdf, { mergePages: true });
      textoExtraido = Array.isArray(resultado.text) ? resultado.text.join('\n') : resultado.text;
    } else {
      const resultado = await mammoth.extractRawText({ buffer: bytes });
      textoExtraido = resultado.value;
    }

    textoExtraido = textoExtraido.trim();

    if (!textoExtraido) {
      return new Response(
        JSON.stringify({
          error: 'No se pudo extraer texto de ese archivo. Puede ser un PDF escaneado (imagen), probá pegando el texto a mano.',
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ texto: textoExtraido }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'No se pudo procesar el archivo', detalle: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
