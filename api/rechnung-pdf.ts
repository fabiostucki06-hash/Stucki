import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

const CC_API = 'https://api.cloudconvert.com/v2';

type CloudConvertTask = {
  id: string;
  name: string;
  status: 'waiting' | 'processing' | 'finished' | 'error';
  result?: { files?: { filename: string; url: string }[] };
  message?: string;
};

async function ccFetch(path: string, apiKey: string, init?: RequestInit) {
  const r = await fetch(`${CC_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body?.message || `CloudConvert HTTP ${r.status}`);
  return body;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.CLOUDCONVERT_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'CLOUDCONVERT_API_KEY nicht konfiguriert' });
    return;
  }

  const { base64, filename } = req.body as { base64?: string; filename?: string };
  if (!base64 || !filename) {
    res.status(400).json({ error: 'base64 und filename erforderlich' });
    return;
  }

  try {
    const job = await ccFetch('/jobs', apiKey, {
      method: 'POST',
      body: JSON.stringify({
        tasks: {
          'import-file': { operation: 'import/base64', file: base64, filename },
          'convert-file': {
            operation: 'convert',
            input: 'import-file',
            output_format: 'pdf',
            engine: 'libreoffice',
          },
          'export-file': { operation: 'export/url', input: 'convert-file' },
        },
      }),
    });

    let jobId = job.data.id as string;
    let exportTask: CloudConvertTask | undefined;
    const deadline = Date.now() + 45_000;

    while (Date.now() < deadline) {
      const status = await ccFetch(`/jobs/${jobId}`, apiKey);
      const tasks: CloudConvertTask[] = status.data.tasks;
      exportTask = tasks.find((t) => t.name === 'export-file');
      const errored = tasks.find((t) => t.status === 'error');
      if (errored) throw new Error(errored.message || 'Konvertierung fehlgeschlagen');
      if (exportTask?.status === 'finished') break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    const fileUrl = exportTask?.result?.files?.[0]?.url;
    if (!fileUrl) throw new Error('PDF-Konvertierung: Zeitüberschreitung');

    const pdfRes = await fetch(fileUrl);
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/\.xlsx$/, '.pdf')}"`);
    res.status(200).send(pdfBuf);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
