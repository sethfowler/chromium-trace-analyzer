import fs from 'fs';
import util from 'util';

const readFileAsync = util.promisify(fs.readFile);

export async function readFileAsJson(filePath: string): Promise<object> {
  const text = await readFileAsync(filePath, 'utf8');
  return JSON.parse(text);
}

export async function readFileAsLines(filePath: string): Promise<string[]> {
  const text = await readFileAsync(filePath, 'utf8');
  return text.split('\n');
}
