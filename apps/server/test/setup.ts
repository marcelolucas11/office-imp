import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.NODE_ENV = 'test';
process.env.SETUP_TOKEN = 'token-de-teste';
process.env.PUBLIC_URL = 'http://office.test';
process.env.APP_SECRET = 'segredo-de-teste-0123456789';
process.env.APP_ENCRYPTION_KEY = 'chave-de-teste-0123456789';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'office-imp-test-'));
process.env.EGRESS_OUT_DIR = path.join(process.env.DATA_DIR, 'meetings');
process.env.WHISPER_URL = 'http://whisper.test';
